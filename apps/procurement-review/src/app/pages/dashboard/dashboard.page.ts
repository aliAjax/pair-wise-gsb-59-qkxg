import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { DatePipe } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { Store } from "@ngrx/store";
import { ButtonModule } from "primeng/button";
import { ProgressBarModule } from "primeng/progressbar";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import {
  type Clause,
  type Clarification,
  type SupplierResponse,
} from "../../core/models/review.models";
import {
  currentRoundReviews,
  currentRoundReviewerCount,
  hasReviewDifference,
  hasSupplementaryMaterial,
  selectAuditLogs,
  selectClauses,
  selectDashboard,
  selectError,
  selectLoading,
  selectPendingClarifications,
  selectRole,
  selectSupplementaryCoverage,
  selectSupplementaryCoverageGapCount,
  selectVersions,
  type SupplementaryCoverageItem,
} from "../../core/state/review.selectors";
import {
  ClarificationTagComponent,
  StatusTagComponent,
} from "../../shared/status-tag.component";

interface PendingIssue {
  clause: Clause;
  response: SupplierResponse;
  clarification: Clarification;
}

@Component({
  selector: "app-dashboard-page",
  imports: [
    RouterLink,
    DatePipe,
    ButtonModule,
    ProgressBarModule,
    TableModule,
    TagModule,
    StatusTagComponent,
    ClarificationTagComponent,
  ],
  templateUrl: "./dashboard.page.html",
  styleUrl: "./dashboard.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  private readonly store = inject(Store);

  readonly dashboard = toSignal(this.store.select(selectDashboard), {
    initialValue: undefined,
  });
  readonly clauses = toSignal(this.store.select(selectClauses), {
    initialValue: [],
  });
  readonly versions = toSignal(this.store.select(selectVersions), {
    initialValue: [],
  });
  readonly auditLogs = toSignal(this.store.select(selectAuditLogs), {
    initialValue: [],
  });
  readonly role = toSignal(this.store.select(selectRole), {
    initialValue: "reviewer_a",
  });
  readonly loading = toSignal(this.store.select(selectLoading), {
    initialValue: true,
  });
  readonly error = toSignal(this.store.select(selectError), {
    initialValue: undefined,
  });
  readonly pendingClarifications = toSignal(
    this.store.select(selectPendingClarifications),
    { initialValue: [] as PendingIssue[] },
  );
  readonly supplementaryCoverage = toSignal(
    this.store.select(selectSupplementaryCoverage),
    { initialValue: [] as SupplementaryCoverageItem[] },
  );
  readonly coverageGapCount = toSignal(
    this.store.select(selectSupplementaryCoverageGapCount),
    { initialValue: 0 },
  );
  readonly uncoveredCoverage = computed(() =>
    this.supplementaryCoverage().filter((item) => item.gap > 0),
  );

  currentRoundOpinions(response: SupplierResponse) {
    return currentRoundReviews(response);
  }
  readonly differences = computed(() =>
    this.clauses().flatMap((clause) =>
      clause.responses
        .filter(hasReviewDifference)
        .map((response) => ({ clause, response })),
    ),
  );
  readonly mandatoryGaps = computed(() =>
    this.clauses()
      .filter((clause) => clause.type === "mandatory")
      .flatMap((clause) =>
        clause.responses
          .filter(
            (response) =>
              response.status === "pending" ||
              response.status === "clarification",
          )
          .map((response) => ({ clause, response })),
      ),
  );
  readonly completion = computed(() => {
    const clauses = this.clauses();
    if (clauses.length === 0) {
      return 0;
    }
    // 有补充材料的响应按当前轮独立评审员是否齐 2 人计算；
    // 无补充材料的响应沿用“是否已有评审意见”的既有覆盖口径。
    const reviewed = clauses.filter((clause) =>
      clause.responses.every((response) =>
        hasSupplementaryMaterial(response)
          ? currentRoundReviewerCount(response) >= 2
          : response.reviews.length > 0,
      ),
    ).length;
    return Math.round((reviewed / clauses.length) * 100);
  });
}
