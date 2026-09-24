# Privacy Policy (revised draft)

<!--
Written 2026-09-24. Unpublished draft — English translation of privacy.ko.revised-draft-2026-09-24.md.
If the two differ, the Korean text prevails. Tags like 〔C03〕 are row numbers in
docs/APP-DATA-COLLECTION-INVENTORY-2026-09-24.md; 〔법정〕 marks items required by Korean law.
{{…}} = values the PD fills in.
-->

**Announced {{announcement date}} · Effective {{effective date}}**

> This policy applies equally to the EARTHUS website (https://earthus.net) and to the EARTHUS Android app, which opens that website. 〔C01〕
> The Chrome New Tab extension does not collect personal information (section 2-J). 〔C19〕

| Item | Details |
|---|---|
| Business name | {{business name}} |
| Representative | {{representative}} |
| Business type | Sole proprietorship (Republic of Korea) |
| Business registration no. | {{business registration number}} |
| Address | {{business address}} |
| Phone | {{phone}} |
| Mail-order business report no. | {{mail-order business report number}} |
| E-mail | dalur@kakao.com |
| Privacy officer | {{representative}} (dalur@kakao.com) |

〔법정〕

---

{{business name}} ("we") publishes this policy under Article 30 of the Korean Personal Information Protection Act. 〔법정〕

## 1. Purposes

| Purpose | What we do | Rows |
|---|---|---|
| Account management | Identify you, keep you signed in, prevent misuse | 〔C01〕 |
| Alerts | Send weather-warning, earthquake, rip-current and tourism-crowding alerts for places you saved | 〔C03〕〔C04〕〔C05〕 |
| Place information | Show weather and place names for a point you chose, or for your current location if you allow it | 〔C10〕〔C11〕 |
| AI questions | Answer a question you typed, using the data layers shown on screen | 〔C08〕 |
| Machine translation | Translate text when you press the translate button | 〔C09〕 |
| Service improvement | Statistics on optional usage events you agreed to; anonymous usage counts | 〔C06〕〔C07〕 |
| Board and pre-registration | Publish feature requests and handle reports; send launch/interest notices | 〔C13〕〔C14〕〔C15〕〔C16〕 |

We **do not currently sell** paid passes. Before we start selling, we will add payment items to this policy and give notice under section 14. 〔C17〕〔C18〕

## 2. Information we process

**A. Sign-in (Google, Apple) — only if you sign in** 〔C01〕

| Type | Items |
|---|---|
| Required | E-mail address, sign-in provider (Google/Apple), provider account identifier |
| Optional | Name (nickname), if the provider shares it |
| Created by the service | Plan level, founding-member flag, access period |

- We never receive passwords. Only Google and Apple sign-in are offered. 〔C01〕
- If you choose Apple's "Hide My Email", we store the relay address Apple gives us. 〔C01〕
- You can use the globe and weather information without signing in. 〔C01〕

**B. Consent records — if you sign in** 〔C02〕

- Whether you accepted the terms, this policy and the age-14 confirmation (required), and marketing, location and usage-analytics choices (optional), with document versions and timestamps.

**C. Alerts — only if you sign in and turn alerts on** 〔C03〕〔C04〕〔C05〕

- **Saved places:** the name you give (up to 40 characters), **the latitude and longitude of that place**, and which alerts and thresholds you chose (earthquake magnitude/distance, tourism place/level). 〔C03〕
  - These are places you saved yourself. We do not track your current location while the app is closed. 〔C03〕
- **Push subscription:** the push address and encryption keys issued by your browser, device type (iOS, Android or web only), language, and delivery success/failure counts. 〔C04〕
- **Sent-alert log:** to avoid sending the same alert twice we keep the event and a device key (an irreversible transform of the push address) for 24 hours. 〔C05〕

**D. Location — optional** 〔C10〕〔C11〕

<!-- (2026-09-24 adversarial review) The first draft said only "if you use My location". Current code asks for the location permission
     automatically on first open and, if granted, sends the coordinates to BigDataCloud/Open-Meteo regardless of the optional in-app
     location consent (inventory C10/C11). Remove the placeholder once the D6 web change (ask only on tap) is live. -->
- EARTHUS asks for your device's (browser's or app's) location permission when you first open it. If you allow it, we use your device's latitude and longitude to show the weather and a place name for that spot. If you decline, you can use the default place or pick a point by hand and use the other features. 〔C10〕〔C11〕
<!-- (2026-09-24 PD decision) Location placeholder closed with A (current code — asks on first open). The sentence above states it. The D6 web change will not ship. -->
- We do not store your current-location coordinates on our servers. Your browser sends them directly to the providers in section 6. 〔C10〕〔C11〕
- Coordinates you **save as an alert place** are stored on our servers as described in C above. 〔C03〕

**E. AI questions ("Ask the Earth" in EARTHUS Intelligence) — when you send a question** 〔C08〕

- Your question (up to 400 characters), language, **the latitude, longitude and altitude of the centre of the view you were looking at**, and the names and values of the data layers you had on.
- We do not send your account identifier with it. We do not store the question; we send it to Google's Gemini API to produce the answer (section 6).
- Your request IP is held briefly in server memory to limit excessive requests and is not stored.
- Please do not put names or contact details in questions.

**F. Machine translation — when you press translate or preview** 〔C09〕

- The text to translate (up to 500 bytes UTF-8 per request) and your IP address are sent directly from your browser to MyMemory (Translated S.r.l.).
- The provider may retain translated segments long-term, so do not translate sensitive content.

**G. Usage statistics** 〔C06〕〔C07〕

- **Optional usage events (signed-in users who agreed):** predefined event names and category values, event time, a random session pseudonym that changes daily, and your account identifier. No precise location, search terms, AI questions, contact details, payment data or raw error text. Refusing has no effect on the service; switching it off in [Settings → Terms & consents] stops collection immediately and deletes your stored events. 〔C06〕
- **Anonymous usage counts (everyone):** only the date, a predefined action name and a count. No user ID, session ID, coordinates or typed text, so no one can be identified. 〔C07〕

**H. Board and pre-registration** 〔C13〕〔C14〕〔C15〕〔C16〕

- Pre-registration: e-mail and marketing-consent choice. 〔C13〕
- Flight/ship feature interest: e-mail and, if signed in, account identifier. 〔C14〕
- Feature-request board: the text you write (up to 1,000 characters) and, if signed in, your account identifier. Reports: the reported post and, if signed in, the reporter's account identifier. 〔C15〕〔C16〕

**I. Information generated automatically** 〔C20〕〔C21〕

- When you access the service, your IP address, access time, requested path and browser information may be recorded by our server and infrastructure providers. 〔C20〕
- We use browser storage (cookies, local storage) to keep you signed in and remember settings. These values stay on your device. 〔C21〕

**J. Chrome New Tab extension** 〔C19〕

- The extension collects no personal information. The city you pick and the last public observations it downloaded are stored only in your browser. It requests public data from our server without any identifier.

**K. Children under 14** 〔법정〕

- We do not accept sign-ups from children under 14. You confirm you are 14 or older when signing up. 〔C02〕
- Children under 14 can use the globe and weather information without signing in. 〔C01〕

## 3. Retention

| Item | Retention | Rows |
|---|---|---|
| Account information | Deleted immediately when you delete your account | 〔C01〕 |
| Consent records | {{PD to choose — A: 3 years after account deletion (proof of consent) — needs a code change, inventory §2-2-1 / B: deleted immediately with the account — current code behaviour}} | 〔C02〕 |
| Saved alert places, push subscription | Deleted when you remove them or turn alerts off, when the browser discards the subscription, or immediately on account deletion | 〔C03〕〔C04〕 |
| Sent-alert log | 24 hours | 〔C05〕 |
| Optional usage events | 1 year from collection; immediately on withdrawal of consent or account deletion | 〔C06〕 |
| Anonymous usage counts | {{retention — the current code has no deletion period (aggregates kept indefinitely), inventory C07; set a period or state "no time limit"}} (aggregate values that identify no one) | 〔C07〕 |
| AI questions, text to translate, current-location coordinates | Not stored by us (provider retention: section 6) | 〔C08〕〔C09〕〔C10〕〔C11〕 |
| Pre-registration e-mail | 1 year after launch, or immediately on unsubscribe | 〔C13〕 |
| Interest e-mail | {{retention — not yet defined, inventory C14}} | 〔C14〕 |
| Board posts, reports | While published. Deleting your account removes the author identifier; the post remains (delete it before deleting your account, or ask us by e-mail) | 〔C15〕〔C16〕 |
| Access logs | {{retention — confirm CloudFront, Supabase and Lambda log settings, inventory C20}} | 〔C20〕 |

Information that Korean law requires us to keep is kept for that period. If we start selling, contract and payment records (5 years) and complaint/dispute records (3 years) under the Korean E-Commerce Act will be added. 〔법정〕〔C17〕

## 4. Provision to third parties

We do not sell or provide personal information to third parties, except with your consent or when required by law. 〔법정〕
We do not use it for advertising and do not run targeted ads. 〔C06〕〔C07〕

## 5. Processors

| Processor | Task | Rows |
|---|---|---|
| Supabase Inc. | Authentication and database (accounts, consents, alert places, push subscriptions, usage events, board, pre-registration) | 〔C01〕–〔C07〕〔C13〕–〔C16〕 |
| Amazon Web Services, Inc. | Servers, storage and delivery (S3, Lambda, CloudFront); relay server for AI questions | 〔C08〕〔C20〕 |
| Google LLC | Google sign-in; generating AI answers (Gemini API) | 〔C01〕〔C08〕 |
| Apple Inc. | Apple sign-in | 〔C01〕 |
| Your browser's push service (Google, Apple, Mozilla, etc.) | Delivering encrypted notifications | 〔C04〕 |

## 6. International transfers

| Recipient | Country | Items | When / how | Purpose | Retention | Rows |
|---|---|---|---|---|---|---|
| Supabase Inc. | {{country/region — confirm in dashboard; current policy states Tokyo, Japan}} | E-mail, account identifier, consent records, alert place coordinates and names, push subscription, usage events, board posts, pre-registration e-mail | Over the network while you use the service | Authentication, database | As in section 3 | 〔C01〕–〔C07〕〔C13〕–〔C16〕 |
| Google LLC | United States{{confirm Gemini processing region}} | Sign-in: e-mail, account identifier / AI questions: question text, view-centre coordinates, layer values | When you sign in / when you send a question | Authentication / answer generation | {{Gemini API retention and training terms — confirm plan}} | 〔C01〕〔C08〕 |
| Apple Inc. | United States | Account identifier (relay address with Hide My Email) | When you sign in | Authentication | Until the processing contract ends | 〔C01〕 |
| Amazon Web Services, Inc. | Republic of Korea (Seoul), United States (Ohio) | Request IP and access logs; AI questions (relayed only, not stored) | While you use the service | Server operation | As in C20 | 〔C08〕〔C20〕 |
| Translated S.r.l. (MyMemory) | Italy | Text to translate (≤500 bytes), request IP | Sent directly by your browser when you press translate | Machine translation | May be retained long-term under the provider's policy | 〔C09〕 |
| BigDataCloud Pty Ltd | Australia (storage: Australia, United States) | Current-location latitude/longitude, request IP | Sent directly by your browser when you open the app with the location permission allowed (or use "My location") | Place-name lookup | Provider's policy | 〔C10〕 |
| Open-Meteo (Meteoblue AG, etc.) | Germany, Switzerland | Latitude/longitude of the point you view (or your current location, if allowed), request IP | Sent directly by your browser when you view point weather | Weather and marine data | Provider's policy | 〔C11〕 |

- If you do not want these transfers, you can avoid signing in, alerts, AI questions and translation, and decline the location permission; the globe and weather information remain available. 〔C01〕〔C08〕〔C09〕〔C10〕〔C11〕
- When map and data files load, your browser sends its IP address to each public data provider. No user input is included. 〔C12〕

## 7. Destruction 〔법정〕

Personal information whose retention period has ended or whose purpose has been achieved is destroyed without delay; electronic files are deleted so they cannot be recovered.

## 8. Your rights 〔법정〕

You may ask at any time to access, correct, delete or suspend processing of your personal information.

- **In the app or website:** Settings → Account → **Download my data** (account, consent records, optional usage events) · Settings → Account → **Delete account** (two confirmations, immediate, cannot be undone). 〔C01〕〔C02〕〔C06〕
- **Alert places:** removing a place on the alerts screen deletes it immediately. 〔C03〕
- **By e-mail:** dalur@kakao.com — including items account deletion does not remove, such as pre-registration and interest e-mails and board posts. Account deletion guide: {{account deletion page URL}} 〔C13〕〔C14〕〔C15〕

## 9. Cookies and browser storage 〔C21〕

We use cookies and browser storage to keep you signed in and save settings. You can refuse them in your browser settings, but staying signed in and some features will not work. We use no third-party advertising trackers.

## 10. Security measures

- Encryption in transit (HTTPS). 〔C01〕–〔C16〕
- Row-level security in the database — users can access only their own data. 〔C01〕〔C03〕〔C04〕〔C06〕
- The sent-alert log uses an irreversible transform instead of the raw push address. 〔C05〕
- No passwords are stored. 〔C01〕

## 11. Privacy officer 〔법정〕

| Item | Details |
|---|---|
| Privacy officer | {{representative}} (owner) |
| Contact | dalur@kakao.com · {{phone}} |

## 12. Remedies (Republic of Korea) 〔법정〕

| Body | Contact |
|---|---|
| Personal Information Dispute Mediation Committee | 1833-6972 · www.kopico.go.kr |
| Personal Information Infringement Report Center | 118 · privacy.kisa.or.kr |
| Supreme Prosecutors' Office Cyber Investigation | 1301 · www.spo.go.kr |
| Korean National Police Agency Cyber Bureau | 182 · ecrm.police.go.kr |

## 13. Outside this policy

- External sites you open through links (original sources such as KMA and JMA) follow their own privacy policies. 〔C12〕

## 14. Changes 〔법정〕

This policy is announced on {{announcement date}} and takes effect on {{effective date}}.
We give notice in the service 7 days before a change takes effect (30 days for changes unfavourable to users).

**Revision {{announcement date}}** — Aligned with what the service actually collects: server storage of saved alert-place coordinates, push subscriptions and the sent-alert log, sending AI questions to Google Gemini, anonymous usage counts, flight/ship interest registration and the board; stated that this policy also covers the Android app and the Chrome extension. Payment items will be added in a further revision when sales start.
