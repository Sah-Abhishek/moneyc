import { Colophon } from "@/components/Colophon";
import { Masthead } from "@/components/Masthead";
import { TabBar } from "@/components/Mobile";
import { Toaster } from "@/components/ui/Toaster";
import { WriteIndicator } from "@/components/ui/WriteIndicator";
import { wallClock } from "@/lib/dates";
import { requireUser, wireConnection } from "@/server/app";
import { readSyncState } from "@/server/gmail/sync";
import { bookTotals } from "@/server/services/summary";
import { waitingCount } from "@/server/services/wire";

// Everything inside the book requires a signed-in user. Server actions check
// again on their own; this layout only decides what to render.
export default async function BookLayout({ children }: LayoutProps<"/">) {
  const { user, ctx } = await requireUser();
  const [sync, waiting, book, connection] = await Promise.all([
    readSyncState(ctx.db, user.id), waitingCount(ctx), bookTotals(ctx), wireConnection(user.id),
  ]);

  return (
    <Toaster>
      <Masthead
        issue={Number(wallClock(user.timezone).slice(5, 7))}
        initial={(user.name ?? user.email).trim()[0]?.toUpperCase() ?? "?"}
        tz={user.timezone}
        wire={{ connection, lastSuccessAt: sync.lastSuccessAt, lastError: sync.lastError, waiting }}
      />
      <main id="main">{children}</main>
      <Colophon entries={book.entries} tracked={book.tracked} since={user.createdAt} />
      <TabBar waiting={waiting} />
      <WriteIndicator />
    </Toaster>
  );
}
