# Notifications

In-app notifications (and an email copy) for toy moderation, identity review and donation status
changes. Handlers run after the business transaction commits (domain events, in process).

- Recipients of one event are notified in parallel; SMTP calls time out after 10 seconds, and a
  failed email never undoes the in-app notification.
- For an ORGANIZATION donation request, the requester side is every active Admin.
- Known limitation: delivery is at most once. A crash between the commit and the handler loses
  that notification, and failed emails are not retried. The planned fix is an outbox: insert the
  notification rows inside the business transaction and send emails from a poller that records
  the email status and retries.
