import { SettingsForms } from "@/components/SettingsForms";
import { ago } from "@/lib/dates";
import { requireUser, wireConnection } from "@/server/app";
import { BANK_DOMAINS } from "@/server/gmail/banks";
import { readSyncState } from "@/server/gmail/sync";

export const metadata = { title: "Settings — Money Control" };

export default async function SettingsPage() {
  const { user, ctx } = await requireUser();
  const [sync, connection] = await Promise.all([readSyncState(ctx.db, user.id), wireConnection(user.id)]);
  const zones = Intl.supportedValuesOf("timeZone");

  return (
    <div className="page">
      <div className="section-head">
        <h2>
          Settings <small>{user.email}</small>
        </h2>
      </div>
      <SettingsForms
        email={user.email}
        timezone={user.timezone}
        zones={zones.includes(user.timezone) ? zones : [user.timezone, ...zones]}
        monthlyBudget={user.monthlyBudget}
        autoFile={user.autoFile}
        connection={connection}
        lastSync={sync.lastSuccessAt ? ago(sync.lastSuccessAt).toLowerCase() : null}
        lastError={sync.lastError}
        mailSenders={user.mailSenders}
        bankCount={new Set(BANK_DOMAINS.map((b) => b.name)).size}
      />
    </div>
  );
}
