# OWMGS Data — Setup Guide (Cloudflare Pages)

Your own website for selling MTN, Telecel and AT data bundles.

**How it works:** a customer picks a bundle → pays on Paystack (MoMo or card) → your site automatically orders the bundle from your supplier → the customer gets an SMS.

---

## What is inside

| Page | Who uses it | What it does |
|---|---|---|
| `/` | Customers & agents | Choose network, bundle, number, then pay |
| `/track` | Customers | Check an order with the reference or phone number |
| `/agent` | Agents (resellers) | Create account, log in, see their orders. Logged-in agents see agent prices on the shop |
| `/admin` | You | Sales & profit, orders, prices, approve agents, settings, test SMS |

Folders:
- `public/` — the pages people see
- `functions/api/` — the server part (payments, orders, logins). Keeps your secret keys safe
- `lib/` — shared code. **`lib/supplier.js`** is the file you will edit when you choose a supplier

Orders, agents and prices are saved in **Cloudflare D1** (Cloudflare's free database). No Google Sheet or Code.gs needed.

---

## Step 1 — Put the files on GitHub

Your GitHub repository must look like this, with these folders at the **top** (not inside another folder):

```
your-repo/
  functions/
  lib/
  public/
  README.md
```

If your repo still has the old Netlify files (`netlify/`, `netlify.toml`, `package.json`), delete them and upload these instead.

## Step 2 — Create the database (D1)

1. In Cloudflare, go to **Storage & databases → D1 SQL database → Create database**.
2. Name it `owmgs-data-db` and click **Create**. That's all — the site makes its own table the first time it runs.

## Step 3 — Set up the Pages project

If you already have a Pages project for `owmgsdatahub.owmgs.com`, open it. If not: **Workers & Pages → Create → Pages → Connect to Git →** choose your repo.

**Build settings** (Settings → Build):

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | *(leave empty)* |
| Build output directory | `public` |
| Root directory | *(leave empty)* |

**Connect the database** (Settings → Bindings → Add → **D1 database**):

| Variable name | D1 database |
|---|---|
| `DB` | `owmgs-data-db` |

The name must be exactly `DB` (capital letters).

## Step 4 — Add your settings (Variables and Secrets)

Go to **Settings → Variables and Secrets → Add**. For passwords and keys, choose type **Secret**.

**Start with these 4 so you can test safely:**

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | A strong password for the admin page |
| `AUTH_SECRET` | Any long random text (at least 16 letters/numbers, 40 is better). Never share it |
| `DEMO_PAYMENTS` | `yes` (orders count as paid without money — for testing only) |
| `SUPPLIER` | `demo` (bundles are not really sent — for testing only) |

**Important:** settings only work after a new deployment. Go to **Deployments**, click **⋯** on the latest one, then **Retry deployment**.

## Step 5 — Check that it works

1. Open `https://owmgsdatahub.owmgs.com/api/shop`. You should see text starting with `{"ok":true`.
   - "Page not found" → the `functions` folder is not at the top of your repo (Step 1), or the build output directory is wrong (Step 3).
   - "Database not connected" → the D1 binding is missing or not named `DB` (Step 3), or you didn't redeploy.
   - "AUTH_SECRET is missing" → add it (Step 4) and redeploy.
2. Open `/admin` and log in with your `ADMIN_PASSWORD`.
3. Go to **Bundles & prices**. The prices there are **samples** — change them to your real prices and click **Save prices**.
4. Buy a bundle on the shop. It goes to the tracking page and shows **Sent**.
5. Open `/agent`, create an agent account, approve it in Admin → **Agents**, then log in as the agent. The shop now shows agent prices.

## Step 6 — Paystack (real payments)

1. Create a Paystack business account (Ghana). Use **Test keys** first.
2. Add variable `PAYSTACK_SECRET_KEY` (type Secret) = your secret key (`sk_test_…`, later `sk_live_…`).
3. In Paystack: *Settings → API Keys & Webhooks → Webhook URL*:
   `https://owmgsdatahub.owmgs.com/api/paystack-webhook`
4. Change `DEMO_PAYMENTS` to `no`. Redeploy.
5. Test with Paystack's test MoMo/card. When Paystack activates your business, switch to the **live** key and set the live webhook URL too.

## Step 7 — SMS receipts

Create an account with **Arkesel** or **mNotify** and get your Sender ID approved (e.g. `OWMGS`).

| Name | Value |
|---|---|
| `SMS_PROVIDER` | `arkesel` or `mnotify` |
| `SMS_API_KEY` | Your SMS API key (type Secret) |
| `SMS_SENDER` | Your approved Sender ID (max 11 letters) |
| `ADMIN_PHONE` | Your number — you get an SMS when an order fails (optional) |

Redeploy, then use **Admin → Settings → Send test SMS**.

## Step 8 — Connect your supplier (real bundles)

1. Choose your supplier, ask for **API access** (API key + API documents), and fund your wallet with them.
2. Add variables:

| Name | Value |
|---|---|
| `SUPPLIER` | `generic` |
| `SUPPLIER_API_URL` | The "buy data" link from their API documents |
| `SUPPLIER_API_KEY` | Your API key (type Secret) |
| `SUPPLIER_KEY_HEADER` | The header name for the key, if not `x-api-key` |

3. Open `lib/supplier.js`. Change the two parts marked **CHANGE HERE** so the field names match your supplier's documents.
4. In Admin → **Bundles & prices**, fill in each bundle's **Supplier code** and your real **Cost**.
5. Redeploy and buy **one small bundle** for your own number before you advertise.

> Send me the supplier's API documents and I will fill in `supplier.js` for you.

## Go-live checklist

- [ ] `DEMO_PAYMENTS` = `no`
- [ ] `SUPPLIER` = `generic` and one real test order worked
- [ ] Paystack **live** secret key + live webhook URL set
- [ ] Real prices, agent prices and costs saved (no red profit numbers in Admin)
- [ ] Test SMS works
- [ ] Admin overview shows no yellow warnings

## Everyday use

- **Failed order** (e.g. supplier wallet empty): top up the supplier, then Admin → Orders → **Try again**.
- **Can't send at all**: refund the customer from your Paystack dashboard, then click **Mark refunded**.
- **Customer says data didn't come**: search their number in Admin → Orders. Hold the mouse on the reference to see the supplier's message.
- **Close the shop for a while**: Admin → Settings → untick **Shop is open**.
- **Profit** on the Overview = sales − supplier cost − estimated Paystack fee (set the fee % in Settings).

## Safety notes

- Never put secret keys inside the HTML files. They only go in Cloudflare Variables and Secrets.
- Prices always come from the server, so nobody can change the price in their browser.
- Each order is sent to the supplier only once, even if Paystack sends the payment notice twice.

---
Designed, developed and powered by Sir Owas · 0249021637 | 0209067004
