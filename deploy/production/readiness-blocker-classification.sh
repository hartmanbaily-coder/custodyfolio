#!/usr/bin/env bash

approval_only_readiness_blockers=(
  "data-retention-policy"
  "incident-response-plan"
  "legal-review"
)

billing_servicing_only_pending_blockers=(
  "billing:billing-checkout-enabled"
  "billing:production-readiness"
  "billing:apple-notifications-v2"
  "billing:billing-tests-recent"
  "billing:billing-policy-versions"
  "billing:billing-tax-review"
  "billing:live-billing-approval"
)

readiness_blocker_in_list() {
  local blocker="$1"
  shift

  local allowed_blocker
  for allowed_blocker in "$@"; do
    if [[ ${blocker} == "${allowed_blocker}" ]]; then
      return 0
    fi
  done
  return 1
}

readiness_blockers_are_approval_only() {
  if [[ $# -eq 0 ]]; then
    return 1
  fi

  local blocker
  for blocker in "$@"; do
    if ! readiness_blocker_in_list \
      "${blocker}" "${approval_only_readiness_blockers[@]}"; then
      return 1
    fi
  done
  return 0
}

readiness_blockers_are_servicing_only_pending() {
  if [[ $# -eq 0 ]]; then
    return 1
  fi

  local blocker
  for blocker in "$@"; do
    if readiness_blocker_in_list \
      "${blocker}" "${approval_only_readiness_blockers[@]}"; then
      continue
    fi
    if ! readiness_blocker_in_list \
      "${blocker}" "${billing_servicing_only_pending_blockers[@]}"; then
      return 1
    fi
  done
  return 0
}
