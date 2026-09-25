import { RuleEditor, RuleList } from "@/components/RuleEditor";
import { requireUser } from "@/server/app";
import { listRules } from "@/server/services/rules";
import { listTags } from "@/server/services/tags";

export const metadata = { title: "Rules — Money Control" };

export default async function RulesPage() {
  const { ctx } = await requireUser();
  const [rules, tags] = await Promise.all([listRules(ctx), listTags(ctx)]);

  return (
    <div className="page">
      <div className="section-head">
        <h2>
          Standing rules <small>How the wire treats new mail</small>
        </h2>
      </div>
      <p className="page-lede">
        Rules run on every new bank alert, top to bottom. The first matching <em>tag</em> rule wins. <em>Ask me first</em> always
        beats <em>file automatically</em>, whatever the order — so a big amount from a trusted sender still waits for you. A{" "}
        <em>sender</em> rule also adds that sender to the mail the wire reads.
      </p>
      {rules.length === 0 ? (
        <div className="empty-state">
          <h3>No rules yet.</h3>
          <p>
            A few that tend to help: tag everything whose payee starts with SWIGGY as Food &amp; delivery; file mail from your main bank
            automatically; ask first about anything over ₹20,000.
          </p>
        </div>
      ) : (
        <RuleList rules={rules} tags={tags} />
      )}
      <RuleEditor tags={tags} />
    </div>
  );
}
