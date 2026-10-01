// Банк өнімдерін (депозиттер мен несиелер) автоматты жаңарту.
// Күніне бір рет cron арқылы жиналады, D1-ге сақталады. Банк қолжетімсіз болса —
// бұрынғы деректер өз күнімен қала береді, сайтта ешқашан тексерілмеген сан көрсетілмейді.

import { FETCHERS as A } from "./sources/banks-a.js";
import { FETCHERS as B } from "./sources/banks-b.js";
import { normalizeBank } from "./normalize.js";

const FETCHERS = { ...A, ...B };

export async function refreshBankProducts(env) {
  const ids = Object.keys(FETCHERS);
  const now = new Date().toISOString();
  const results = await Promise.allSettled(ids.map((id) => FETCHERS[id]()));
  const statements = [];
  const report = [];

  results.forEach((res, i) => {
    const id = ids[i];
    if (res.status !== "fulfilled") {
      const message = String(res.reason?.message || res.reason).slice(0, 300);
      report.push({ id, ok: false, message });
      statements.push(
        env.DB.prepare("INSERT INTO fetch_log (bank_id, ok, message, at) VALUES (?, 0, ?, ?) ON CONFLICT (bank_id) DO UPDATE SET ok = 0, message = excluded.message, at = excluded.at")
          .bind(id, message, now)
      );
      return;
    }
    const { deposits, loans, dropped } = normalizeBank(res.value);
    if (!deposits.length && !loans.length) {
      const message = `бос нәтиже (тексеруден өтпеді: ${dropped})`;
      report.push({ id, ok: false, message });
      statements.push(
        env.DB.prepare("INSERT INTO fetch_log (bank_id, ok, message, at) VALUES (?, 0, ?, ?) ON CONFLICT (bank_id) DO UPDATE SET ok = 0, message = excluded.message, at = excluded.at")
          .bind(id, message, now)
      );
      return;
    }
    report.push({ id, ok: true, deposits: deposits.length, loans: loans.length, dropped });
    statements.push(
      env.DB.prepare(
        `INSERT INTO bank_products (bank_id, deposits, loans, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (bank_id) DO UPDATE SET deposits = excluded.deposits, loans = excluded.loans, updated_at = excluded.updated_at`
      ).bind(id, JSON.stringify(deposits), JSON.stringify(loans), now),
      env.DB.prepare("INSERT INTO fetch_log (bank_id, ok, message, at) VALUES (?, 1, NULL, ?) ON CONFLICT (bank_id) DO UPDATE SET ok = 1, message = NULL, at = excluded.at")
        .bind(id, now)
    );
  });

  if (statements.length) await env.DB.batch(statements);
  console.log("bank products refresh", JSON.stringify(report));
  return report;
}

export async function readBankProducts(env) {
  const [rows, log] = await env.DB.batch([
    env.DB.prepare("SELECT bank_id, deposits, loans, updated_at FROM bank_products"),
    env.DB.prepare("SELECT bank_id, ok, at FROM fetch_log"),
  ]);
  const checked = Object.fromEntries(log.results.map((r) => [r.bank_id, { ok: !!r.ok, at: r.at }]));
  const banks = {};
  for (const r of rows.results) {
    banks[r.bank_id] = {
      deposits: JSON.parse(r.deposits),
      loans: JSON.parse(r.loans),
      updatedAt: r.updated_at,
      checkedAt: checked[r.bank_id]?.at || r.updated_at,
      lastCheckOk: checked[r.bank_id]?.ok ?? true,
    };
  }
  return { banks, auto: Object.keys(FETCHERS) };
}
