# Local Wayfinder Tracker

## Wayfinding operations

- The map is `map.md`; `labels: [wayfinder:map]` identifies it.
- A child ticket is a Markdown file in `tickets/` whose `parent` points to the map.
- Claim a ticket before work by setting `assignee` to the developer driving the map.
- `blocked_by` contains ticket ids. A ticket is unblocked when every referenced ticket is closed.
- The frontier is the ordered set of tickets with `status: open`, an empty `assignee`, and no open blockers.
- Record a resolution comment in `comments/<ticket-id>.md`, set the ticket to `status: closed`, then append one linked gist to the map's **Decisions so far**.

