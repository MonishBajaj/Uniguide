-- The worker claims a message by inserting its log row before sending, and releases the claim if the send fails.
grant delete on public.lifecycle_log to notifier;
