# ToyFlow Backend Architecture Baseline

## Source hierarchy

1. Explicit project decisions, especially D-004.
2. Report 3 Main Business Workflow and Use Cases.
3. Report 1 scope and proposed solution.
4. Report 2 technology, plan and quality controls.
5. General architecture guidance.

## Dependency direction

The structure adapts the Bulletproof React principle `shared -> features -> app` to the backend:

```text
config/shared/infrastructure -> features -> app
```

The `app` layer is the only composition root. Feature-to-feature imports are prohibited. A feature that needs another capability depends on a shared port or publishes a domain event; the `app` layer wires the implementation.

## Workflow mapping

```text
BF-01  auth + identity-verification + users
BF-02  toy-catalog + listings + rental-orders + order-status-history + payments
BF-03  toy-catalog + listings + resale-orders + order-status-history + payments
BF-04  toy-catalog + listings + donations + order-status-history
BF-05  disputes + payments + moderation + ai-assistance
Trust  ratings + chat + notifications
```

## Scope guardrails

- `Shipping` is an informational lifecycle status.
- No delivery-provider integration, delivery fee, tracking code or platform-operated delivery.
- AI is advisory; Admin makes final moderation and dispute decisions.
- Payments and deposits are records around an external service boundary, not an approved licensed wallet.
- Exact status-transition permissions and timer rules remain `[NEEDS CONFIRMATION]`; the scaffold defines status catalogs but deliberately does not implement transition automation.

## First implementation order

1. Auth, user and identity-verification contract.
2. Toy catalog and listing moderation.
3. Order status history.
4. Rental flow BF-02.
5. Resale flow BF-03.
6. Donation flow BF-04.
7. Payment/deposit boundary and dispute flow BF-05 after approval.
8. Ratings, chat, notifications and bounded AI assistance.
