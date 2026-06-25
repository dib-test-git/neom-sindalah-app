# Summary

<!-- 1-3 sentences describing the change. Mention guest-facing vs staff-facing. -->

## Jira

- [KAN-XXX](https://neom.atlassian.net/browse/KAN-XXX)

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / cleanup
- [ ] Docs
- [ ] Build / CI

## Affected surface

- [ ] `apps/guest-mobile`
- [ ] `apps/staff-mobile`
- [ ] `services/concierge-chat`
- [ ] `services/opera-integration`
- [ ] `services/marina-availability`
- [ ] `services/vip-audit`

## Test plan

<!-- What you did to verify. Add screenshots / screen recordings for mobile changes. -->

- [ ] Unit tests added / updated
- [ ] Tested locally on iOS sim
- [ ] Tested locally on Android emu
- [ ] Backend integration test passes

## Risk

- [ ] Touches Opera folio posting (requires `compliance` review)
- [ ] Touches VIP audit log (requires `compliance` review)
- [ ] Touches charge / payment paths

## Reviewer checklist

- [ ] No PII in logs
- [ ] Errors surfaced to the UI in both AR and EN
- [ ] Telemetry events follow the `sindalah.<surface>.<action>` convention
