import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBankMail, maskRef } from "./parse.ts";

test("HDFC UPI debit", () => {
  const p = parseBankMail(
    "Dear Customer, Rs.10.00 has been debited from account **4721 to VPA vinodsi@okaxis VINOD SI on 22-09-26. " +
      "Your UPI transaction reference number is 626412345672. If you did not authorize this transaction, please report it.",
  );
  assert.equal(p.direction, "debit");
  assert.equal(p.amountPaise, 1000);
  assert.equal(p.payee, "VINOD SI");
  assert.equal(p.channel, "UPI");
  assert.equal(p.ref, "626412345672");
  assert.equal(p.account, "4721");
  assert.equal(p.postedAt, "2026-09-22T00:00:00");
  assert.equal(p.confidence, 1);
});

test("ICICI card debit with Info: payee", () => {
  const p = parseBankMail(
    "Transaction alert: your account XX9930 has been debited by Rs. 1,899.00 on 22-Sep-26 09:31:07. " +
      "Info: PAYU*MERCHANT. The Available Balance is Rs. 56,678.00. Ref no 448123456719.",
  );
  assert.equal(p.direction, "debit");
  assert.equal(p.amountPaise, 189900);
  assert.equal(p.payee, "PAYU*MERCHANT");
  assert.equal(p.account, "9930");
  assert.equal(p.ref, "448123456719");
  assert.equal(p.postedAt, "2026-09-22T09:31:07");
});

test("Axis debit with 'at' merchant", () => {
  const p = parseBankMail(
    "INR 349.00 debited from A/c no. XX2210 on 22-09-2026 08:12:33 IST at SWIGGY. UPI Ref no 447700112233.",
  );
  assert.equal(p.amountPaise, 34900);
  assert.equal(p.payee, "SWIGGY");
  assert.equal(p.channel, "UPI");
  assert.equal(p.account, "2210");
  assert.equal(p.postedAt, "2026-09-22T08:12:33");
});

test("UPI credit from a person", () => {
  const p = parseBankMail(
    "Rs. 2,500.00 credited to your account XX4721 by VPA priya@okicici PRIYA NAIR on 20-09-26. UPI Ref No 512233445566.",
  );
  assert.equal(p.direction, "credit");
  assert.equal(p.amountPaise, 250000);
  assert.equal(p.payee, "PRIYA NAIR");
});

test("NEFT salary credit", () => {
  const p = parseBankMail(
    "Your A/c XX4721 is credited with INR 92,000.00 on 21-09-2026 10:02 by ACME DESIGN LABS via NEFT. UTR HDFCN52026092112345.",
  );
  assert.equal(p.direction, "credit");
  assert.equal(p.channel, "NEFT");
  assert.equal(p.payee, "ACME DESIGN LABS");
  assert.equal(p.ref, "HDFCN52026092112345");
});

test("junk mail scores low", () => {
  const p = parseBankMail("Your monthly statement is ready to view.");
  assert.ok(p.confidence < 0.3);
});

test("maskRef", () => {
  assert.equal(maskRef("626412345672"), "626xxxxx72");
});
