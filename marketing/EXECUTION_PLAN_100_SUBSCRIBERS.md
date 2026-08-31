# Custody Folio 100 Subscriber Sprint

Start date: August 30, 2026

Target date: September 29, 2026

Business objective: Reach 100 paid subscribers while protecting customer trust, satisfaction, and product quality.

## The constraint that controls the goal

The current product gives every eligible customer a 30 day trial and prevents a paid purchase until that trial ends. The web checkout rejects an active trial. The App Store transaction route also rejects a new paid subscription while full trial access is active.

This means a customer who starts today cannot become paid until the target date. A marketing campaign cannot produce 100 new paid customers inside 30 days under the current purchase policy unless a meaningful number of existing trials already expire during the window.

## Recommended goal structure

1. Acquire 500 qualified trial accounts by September 29.

2. Meaningfully activate at least 250 of those accounts.

3. Reach 100 paid subscribers by October 29 using a planning assumption of 20 percent trial conversion.

4. The CEO authorized a voluntary billing choice during the account trial so customers who are ready can become paid subscribers before September 29.

The billing decision requires product, policy, provider, and App Store review. It is not a marketing setting.

## Funnel required for 100 paid subscribers

1. Paid subscriber target: 100.

2. Planning conversion from qualified trial to paid: 20 percent.

3. Qualified trial requirement: 500.

4. Planning conversion from qualified landing visit to trial: 15 percent.

5. Qualified visit requirement: about 3,334.

6. Daily pace across 30 days: about 112 qualified visits and 17 new trials.

These conversion rates are planning assumptions until the first live cohorts create a baseline.

## Channel contribution targets

### Professional referrals

Target contribution: 175 qualified trials.

Actions:

1. Recruit five family law professionals for the first advisory group.

2. Ask each advisor to review the product explanation, report workflow, and client handout.

3. Expand outreach to 25 qualified professionals after the first five conversations.

4. Give each participating professional a trackable campaign link.

5. Measure referred customers by activation and satisfaction, not referral count alone.

### App Store search

Target contribution: 150 qualified trials.

Actions:

1. Align the first three screenshots to three outcomes: one clear timeline, connected supporting files, and cleaner preparation for an attorney conversation.

2. Use the subtitle Parenting Records and Reports.

3. Focus search language on custody log, parenting time tracker, custody records, incident log, expense tracker, and evidence organizer.

4. Start with exact intent searches after approval.

5. Do not activate paid search until the CEO sets a budget cap.

### Founder led communities

Target contribution: 100 qualified trials.

Actions:

1. Participate only where founders and useful resources are permitted.

2. Identify the company relationship in every product mention.

3. Lead with a useful factual record checklist instead of a direct sales pitch.

4. Never pitch inside a crisis post.

5. Invite interested adults to a short product demonstration or the launch list.

### Owned content and email

Target contribution: 75 qualified trials.

Actions:

1. Publish one useful search guide each week.

2. Publish two short educational or product videos each week.

3. Send one useful email each week.

4. Use the Factual Custody Record Checklist as the primary signup asset.

5. Ask subscribers for a conversation only after delivering the promised resource.

## Work starting today

1. Lock the launch positioning and approved claims.

2. Prepare the homepage message, App Store message, founder announcement, community post, professional outreach message, and launch email sequence.

3. Prepare the parent and professional conversation guides.

4. Create the daily launch scorecard.

5. Identify the product events required to measure visits, trials, activation, report creation, subscription, cancellation, and satisfaction without collecting case content.

6. Prepare the first seven days of educational content.

7. Build the first professional target list after the CEO confirms the initial geographic scope.

## First seven days

### Day 1

1. Approve the paid deadline decision.

2. Approve the launch message.

3. Set the monthly marketing test budget.

4. Confirm the first geographic focus.

### Day 2

1. Publish the factual record checklist page.

2. Publish the launch list form.

3. Confirm that campaign attribution and privacy safe activation events work.

### Day 3

1. Invite the first five parent conversations.

2. Invite the first five professional conversations.

3. Record the first product demonstration.

### Day 4

1. Publish the first educational guide.

2. Publish the first short product demonstration.

3. Begin permitted founder community participation.

### Day 5

1. Complete at least two parent conversations.

2. Complete at least one professional conversation.

3. Fix the most frequent message or onboarding confusion.

### Day 6

1. Publish the second short video.

2. Send the first useful email.

3. Review visit quality, trial starts, and activation.

### Day 7

1. Complete the first weekly customer review.

2. Select one experience improvement for the next week.

3. Keep, change, or stop each channel based on customer quality.

## Daily operating rhythm after launch

### Morning

1. Review new trial accounts and source quality.

2. Review failed signup, record, report, and purchase actions.

3. Review support messages and App Store reviews.

4. Respond to customer issues before publishing promotional content.

### Midday

1. Complete one customer or professional conversation.

2. Publish or prepare one useful content asset.

3. Complete five thoughtful professional or community contacts.

### End of day

1. Update the scorecard.

2. Record the top customer question.

3. Record the top conversion obstacle.

4. Choose the single most important action for the next day.

## Weekly targets

### Week 1

Target: 50 qualified trials and 10 customer conversations.

### Week 2

Target: 100 additional qualified trials and five professional advocates engaged.

### Week 3

Target: 150 additional qualified trials and one acquisition source with at least 50 percent meaningful activation.

### Week 4

Target: 200 additional qualified trials and a complete plan for trial conversion follow through.

Total planning target: 500 qualified trials.

## Growth gates

Traffic does not scale unless all of the following remain healthy:

1. Meaningful activation is at least 50 percent.

2. Customer value satisfaction is at least 80 percent among a meaningful response base.

3. Median first human support response is within one business day.

4. Export success is at least 95 percent.

5. No critical privacy issue remains unresolved.

6. Marketing analytics contains no case content or sensitive personal details.

## Measurement command

Run the aggregate scorecard from the project with production environment variables available:

`npm run growth:scorecard`

The report calculates trial volume, meaningful activation, first report use, repeat value, satisfaction, and paid conversion. It prints aggregate totals only. It does not print names, email addresses, case details, record contents, or account identifiers.

Meaningful activation means that an account completes one of these paths within seven days of trial start:

1. Save at least three dated records.

2. Save at least two dated records and create an export.

Enter satisfaction responses in `marketing/customer_value_responses.csv` using only the response date and a score from 1 through 5. Do not enter names, email addresses, case details, comments, or account identifiers.

## CEO decisions required

1. Confirm whether the 30 day target means 100 paid accounts or 100 meaningfully activated trial accounts.

2. If it means paid accounts, decide whether the billing policy may change before the trial ends.

3. Set the maximum paid marketing test budget.

4. Confirm whether initial professional outreach should begin in Alaska, in a selected group of states, or across the United States.
