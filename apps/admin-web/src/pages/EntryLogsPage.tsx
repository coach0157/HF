/**
 * Entry log oversight view — spec 1.3 "รายงาน: export ประวัติเข้า-ออก",
 * MVP_BACKLOG.md Epic 5 (P1).
 *
 * Dev agent TODO: search/filter via `GET /entry-logs?house_id=&date=`
 * (paginated — see the index on EntryLog in
 * apps/backend/prisma/schema.prisma), read-only for admins in MVP scope.
 */
export function EntryLogsPage() {
  return (
    <div>
      <h1>ประวัติเข้า-ออก</h1>
      <p>TODO: search/filter entry logs — see component doc comment.</p>
    </div>
  );
}
