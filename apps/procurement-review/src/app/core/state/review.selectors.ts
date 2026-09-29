import { createFeatureSelector, createSelector } from "@ngrx/store";
import type {
  Clause,
  ClauseTreeNode,
  ComplianceStatus,
  ReviewState,
  ReviewerOpinion,
  SupplierResponse,
} from "../models/review.models";

export const selectReviewState =
  createFeatureSelector<ReviewState>("review");

export const selectClauses = createSelector(
  selectReviewState,
  (state) => state.clauses,
);

export const selectVersions = createSelector(
  selectReviewState,
  (state) => state.versions,
);

export const selectAuditLogs = createSelector(
  selectReviewState,
  (state) => state.auditLogs,
);

export const selectDashboard = createSelector(
  selectReviewState,
  (state) => state.dashboard,
);

export const selectSuppliers = createSelector(
  selectReviewState,
  (state) => state.suppliers,
);

export const selectFilters = createSelector(
  selectReviewState,
  (state) => state.filters,
);

export const selectRole = createSelector(
  selectReviewState,
  (state) => state.role,
);

export const selectSelectedSupplierIds = createSelector(
  selectReviewState,
  (state) => state.selectedSupplierIds,
);

export const selectLoading = createSelector(
  selectReviewState,
  (state) => state.loading,
);

export const selectSaving = createSelector(
  selectReviewState,
  (state) => state.saving,
);

export const selectError = createSelector(
  selectReviewState,
  (state) => state.error,
);

export const selectToast = createSelector(
  selectReviewState,
  (state) => state.toast,
);

export const hasReviewDifference = (response: SupplierResponse): boolean => {
  const decisions = new Set(
    currentRoundReviews(response)
      .filter((review) => review.decision !== "clarification")
      .map((review) => review.decision),
  );
  return decisions.size > 1;
};

/** 供应商已登记过补充材料（已回复澄清）的响应。 */
export const hasSupplementaryMaterial = (response: SupplierResponse): boolean =>
  response.clarifications.some(
    (clarification) => clarification.status === "responded",
  );

/** 针对当前评审轮次（最近一次补充回复之后）的意见；旧意见只留存在历史记录中。 */
export const currentRoundReviews = (
  response: SupplierResponse,
): ReviewerOpinion[] =>
  response.reviews.filter(
    (review) => (review.reviewRound ?? 1) === response.reviewRound,
  );

/** 当前轮已经针对新回复出具意见的不同评审员数量。 */
export const currentRoundReviewerCount = (response: SupplierResponse): number =>
  new Set(currentRoundReviews(response).map((review) => review.reviewer)).size;

/**
 * 补充材料重新覆盖缺口：有补充材料的响应当前轮需要两位不同评审员，
 * 返回尚缺的意见数量（0 表示已覆盖）；无补充材料的响应沿用现有处理。
 */
export const supplementaryCoverageGap = (response: SupplierResponse): number =>
  hasSupplementaryMaterial(response)
    ? Math.max(0, 2 - currentRoundReviewerCount(response))
    : 0;

export interface SupplementaryCoverageItem {
  clause: Clause;
  response: SupplierResponse;
  round: number;
  reviewerCount: number;
  gap: number;
  reviewers: string[];
}

export const findResponse = (
  clause: Clause,
  supplierId: string,
): SupplierResponse | undefined =>
  clause.responses.find((response) => response.supplierId === supplierId);

const filteredClauses = createSelector(
  selectClauses,
  selectFilters,
  (clauses, filters) => {
    const keyword = filters.keyword.trim().toLowerCase();
    return clauses.filter((clause) => {
      const matchesKeyword =
        !keyword ||
        [
          clause.code,
          clause.title,
          clause.category,
          clause.requirement,
          ...clause.responses.map((response) => response.supplierName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesCategory =
        !filters.category || clause.category === filters.category;
      const matchesType =
        filters.type === "all" || clause.type === filters.type;
      const matchesDifference =
        !filters.differencesOnly ||
        clause.responses.some(hasReviewDifference);
      return (
        matchesKeyword &&
        matchesCategory &&
        matchesType &&
        matchesDifference
      );
    });
  },
);

export const selectFilteredClauses = filteredClauses;

export const selectClauseTree = createSelector(
  selectClauses,
  filteredClauses,
  (allClauses, matchingClauses): ClauseTreeNode[] => {
    if (matchingClauses.length === 0) {
      return [];
    }
    const includedIds = new Set<string>();
    const byId = new Map(allClauses.map((clause) => [clause.id, clause]));
    matchingClauses.forEach((clause) => {
      includedIds.add(clause.id);
      let parentId = clause.parentId;
      while (parentId && !includedIds.has(parentId)) {
        includedIds.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    });
    const selected = allClauses
      .filter((clause) => includedIds.has(clause.id))
      .sort((a, b) => a.order - b.order);
    const nodeMap = new Map<string, ClauseTreeNode>();
    selected.forEach((clause) => {
      nodeMap.set(clause.id, { ...clause, children: [] });
    });
    const roots: ClauseTreeNode[] = [];
    selected.forEach((clause) => {
      const node = nodeMap.get(clause.id);
      if (!node) {
        return;
      }
      if (clause.parentId && nodeMap.has(clause.parentId)) {
        nodeMap.get(clause.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  },
);

export const selectDifferences = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses
        .filter(hasReviewDifference)
        .map((response) => ({ clause, response })),
    ),
);

export const selectPendingClarifications = createSelector(
  selectClauses,
  (clauses) =>
    clauses.flatMap((clause) =>
      clause.responses.flatMap((response) =>
        response.clarifications
          .filter(
            (clarification) =>
              clarification.status === "open" ||
              clarification.status === "overdue",
          )
          .map((clarification) => ({
            clause,
            response,
            clarification,
          })),
      ),
    ),
);

export const selectSupplementaryCoverage = createSelector(
  selectClauses,
  (clauses): SupplementaryCoverageItem[] =>
    clauses.flatMap((clause) =>
      clause.responses
        .map((response) => ({
          clause,
          response,
          round: response.reviewRound,
          reviewerCount: currentRoundReviewerCount(response),
          gap: supplementaryCoverageGap(response),
          reviewers: Array.from(
            new Set(currentRoundReviews(response).map((review) => review.reviewer)),
          ),
        }))
        .filter((item) => hasSupplementaryMaterial(item.response)),
    ),
);

export const selectSupplementaryCoverageGapCount = createSelector(
  selectSupplementaryCoverage,
  (items) => items.reduce((total, item) => total + item.gap, 0),
);

export const selectReusedProofs = createSelector(
  selectClauses,
  (clauses) => {
    const counts = new Map<
      string,
      Array<{ clause: Clause; response: SupplierResponse }>
    >();
    clauses.forEach((clause) => {
      clause.responses.forEach((response) => {
        const current = counts.get(response.proofFingerprint) ?? [];
        current.push({ clause, response });
        counts.set(response.proofFingerprint, current);
      });
    });
    return Array.from(counts.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([fingerprint, entries]) => ({ fingerprint, entries }));
  },
);

export const responseDecisionSummary = (
  response: SupplierResponse,
): ComplianceStatus[] =>
  Array.from(
    new Set(currentRoundReviews(response).map((review) => review.decision)),
  );
