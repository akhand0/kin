-- Explicit patient requests to speak with their care team should appear in the
-- clinician's decision queue even when symptom triage is not a red flag.

alter table alerts drop constraint if exists alerts_kind_check;
alter table alerts
  add constraint alerts_kind_check
  check (kind in (
    'quiet_anomaly',
    'loud_anomaly',
    'unreachable',
    'care_request'
  ));
