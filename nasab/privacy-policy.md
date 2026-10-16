# Privacy Policy for Nasab

**Last updated:** July 27, 2026

TappStudio ("TappStudio," "we," "us," or "our") operates the Nasab mobile application (the "App"), a family archive and genealogy service that helps families preserve stories, photos, voice notes, videos, and lineage across generations. This Privacy Policy explains what information we collect, how we use it, who we share it with, and the choices and rights available to you.

By creating an account or otherwise using Nasab, you agree to the collection and use of information described in this Privacy Policy. If you do not agree, please do not use the App.

---

## 1. Who This Policy Applies To

Nasab is a shared, family-oriented product. Because of this, the information we hold falls into two categories:

- **Account holder information** — information about you, collected when you register and use the App.
- **Family member information** — information about relatives (living or deceased) that an account holder or another family member adds to a shared Family Space. This may include people who have never used the App and are not themselves registered users (for example, a grandparent whose photo and life story is uploaded by a grandchild, or a deceased ancestor added to the family tree).

If you are added to a Family Space by someone else and you did not create that entry yourself, see Section 9 ("Information About Non-User Family Members") for how you can request access, correction, or removal.

---

## 2. Information We Collect

### 2.1 Information you provide directly

- **Account information:** name, email address, password (authentication is handled securely and we do not store your password in plain text), profile photo, date of birth, and gender, collected during registration and onboarding.
- **Family and relationship data:** family member names, dates of birth and death, biographies, relationship links (parent, spouse, sibling, child, etc.), and optional contact details (email, phone number) for family members you add.
- **Content you upload:** photographs, videos, voice recordings, documents, timeline events, captions, and comments that you or other Family Space members choose to store in the App.
- **Family Space information:** family name, invite links/codes, and roles assigned to members (e.g., Owner, Admin, Contributor, Viewer).
- **Communications:** messages you send us for support, feedback, or feature requests (e.g., via the in-app feedback email).

### 2.2 Information collected automatically

- **Device and usage data:** device type, operating system, app version, crash logs, and general usage/interaction data (e.g., which screens are used, feature engagement), collected via analytics tooling to help us improve the App.
- **Push notification tokens:** a device-specific token used to deliver notifications (e.g., new memories, tagged photos, birthday and anniversary reminders, family invitations) via Firebase Cloud Messaging.
- **Storage usage data:** the amount of storage your Family Space is using against your plan's quota.

### 2.3 Information from third parties

- If you choose to sign in using a third-party provider (e.g., Google or Apple Sign-In), we receive basic profile information (name, email address) from that provider as permitted by your settings with them.
- If you subscribe to a paid plan, our subscription management provider (RevenueCat) and the relevant app store (Apple App Store or Google Play) share subscription status and entitlement information with us. We do not receive or store your full payment card details — these are handled entirely by Apple, Google, or their payment processors.

We do **not** knowingly collect precise real-time location data, and Nasab does not request location permissions for its core features.

---

## 3. How We Use Information

We use the information described above to:

- Create and manage your account and Family Spaces
- Store, organize, and display family trees, timelines, memories, and profiles
- Enable family members to share, view, and collaborate on content according to their assigned role and permissions
- Send notifications you have opted into (new memories, tags, birthdays, anniversaries, invitations)
- Process invite links and add members to a Family Space
- Calculate and enforce storage quotas tied to your subscription plan
- Maintain, secure, debug, and improve the App
- Provide customer support and respond to your inquiries
- Detect, prevent, and address technical issues, fraud, or abuse
- Comply with legal obligations

We do not sell your personal information, and we do not use your family photos, voice notes, or biographical content to train third-party AI models or for advertising purposes.

---

## 4. How Information Is Shared

We share information only in the following circumstances:

### 4.1 With other members of your Family Space
Content and profile information you add is visible to other members of the same Family Space, according to their role (Owner, Admin, Contributor, Viewer, Child) and the permissions configured for that space. Nasab is built around family-level sharing — content is not private to you alone once added to a shared space, unless the App specifically marks it as such.

### 4.2 With service providers
We rely on the following infrastructure and service providers to operate Nasab. Each processes data only as necessary to provide their service to us:

| Provider | Purpose | Data involved |
|---|---|---|
| **Supabase** | Authentication, database (family graph, relationships, permissions), Row Level Security enforcement | Account credentials, family/member/relationship records, roles and permissions |
| **Google Firebase (Storage & Cloud Messaging)** | Storage of photos, videos, and voice notes; delivery of push notifications | Media files, device push tokens |
| **RevenueCat** | Subscription and entitlement management | Subscription status, purchase/entitlement identifiers (not raw payment details) |
| **Apple App Store / Google Play** | Billing and payment processing for subscriptions | Payment method details (handled entirely by Apple/Google; not shared with us) |
| **Analytics provider** | Product usage analytics to improve the App | Device/usage data, in de-identified or aggregated form where possible |

We enter into appropriate data protection arrangements with these providers and only share what is necessary for them to perform their function.

### 4.3 For legal reasons
We may disclose information if required to do so by law, regulation, legal process, or governmental request, or where we believe disclosure is necessary to protect the rights, property, or safety of TappStudio, our users, or the public.

### 4.4 Business transfers
If TappStudio is involved in a merger, acquisition, or sale of assets, information may be transferred as part of that transaction. We will notify you of any such change and any resulting change to this Policy.

We do not share your data with third parties for their own independent marketing purposes.

---

## 5. Data Storage, Security, and International Transfers

- Media files (photos, videos, voice notes) are stored in **private, access-controlled cloud storage buckets** — never in publicly accessible locations.
- Access to media is granted only via **short-lived, signed URLs** generated after your identity and Family Space membership are verified.
- Family and relationship data is protected using **Row Level Security (RLS)**, ensuring only authenticated members of the same Family Space can query that family's records.
- We apply role-based permissions (Owner, Admin, Contributor, Viewer, Child) to control who can view, upload, edit, or delete content.
- No method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute security. You are responsible for keeping your account credentials confidential.
- Our infrastructure providers may process and store data in regions outside your home country (including multi-region cloud storage). By using Nasab, you consent to this international processing and storage of your information, which is carried out under contractual safeguards with our providers.

---

## 6. Data Retention

- We retain your account and Family Space information for as long as your account is active.
- If a family member leaves a Family Space, their previously uploaded content is **not automatically deleted** — it remains part of the family's shared archive, consistent with Nasab's purpose of preserving family history, unless the content owner or a Family Space Owner requests its removal.
- If your account is inactive or unpaid beyond your plan's terms, we do not delete your family's data for non-payment; access may be restricted to a read-only state instead, as described in Section 7 of our Terms of Use.
- You may request deletion of your account and associated personal data at any time (see Section 8). Some information may be retained where required for legal, security, or legitimate archival/backup purposes for a limited period after deletion.

---

## 7. Children's Information

Nasab is **not directed at children**, and we do not knowingly allow children under 13 (or the relevant minimum age in your jurisdiction) to independently create an account.

However, because Nasab is a genealogy and family archive product, adult account holders may add **profiles of minors** (e.g., their own children, nieces, or nephews) as family members within a Family Space, for the purpose of building a family tree, timeline, or preserving memories. This is done at the discretion and responsibility of the adult family member who creates the entry, who confirms they have the right and appropriate family authority to do so.

Minor profiles created this way are, by default, restricted to **view-only** access if the minor themselves later gains access to the App, and are subject to the same Family-Space-level access controls as any other member. If you are a parent or guardian and believe a minor's information has been added inappropriately or you wish to have it corrected or removed, contact us at the email in Section 12.

---

## 8. Your Rights and Choices

Depending on your location, you may have rights to:

- **Access** the personal information we hold about you
- **Correct** inaccurate or incomplete information
- **Delete** your account and associated personal data
- **Export** your data (e.g., family tree export in PDF or GEDCOM format, where available on your plan)
- **Object to or restrict** certain processing
- **Withdraw consent** where processing is based on consent (e.g., optional push notifications)

You can exercise most of these rights directly within the App (profile editing, notification settings, account deletion in Settings) or by contacting us at the email address in Section 12. We will respond to verified requests within the timeframe required by applicable law.

If you are located in the **European Economic Area (EEA), UK, or Switzerland**, you may also have rights under the GDPR, including the right to lodge a complaint with your local data protection authority.

If you are a **California resident**, you may have rights under the CCPA/CPRA, including the right to know, delete, and opt out of the sale or sharing of personal information. We do not sell or share personal information as those terms are defined under the CCPA.

If you are located in **India**, we process your personal data in accordance with the Digital Personal Data Protection Act, 2023, and you may exercise the rights of access, correction, erasure, and grievance redressal described above by contacting us.

---

## 9. Information About Non-User Family Members

Because family members (including deceased relatives) can be added to the App by someone else, an individual whose information appears in a Family Space but who has not created their own account may:

- Request a copy of the information held about them
- Request correction of inaccurate information
- Request removal of their profile or content, subject to the legitimate archival interests of the Family Space and applicable law

Such requests should be sent to the email in Section 12 along with reasonable proof of identity or relationship. Where a request conflicts with another family member's legitimate right to preserve shared family history, we will make a reasonable, good-faith effort to balance both interests and may request the Family Space Owner's input before acting.

---

## 10. Notifications and Communications

You can control push notifications (new memories, tags, birthdays, anniversaries, invitations) through your device's system settings and within the App's notification preferences. Certain administrative or security-related communications (e.g., account verification, critical service updates) cannot be opted out of while you maintain an account.

---

## 11. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or for other operational reasons. We will notify you of material changes through the App or by email, and will update the "Last updated" date above. Continued use of Nasab after changes take effect constitutes acceptance of the revised Policy.

---

## 12. Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, contact us at:

**TappStudio**
Email: tappstudio.in@gmail.com
