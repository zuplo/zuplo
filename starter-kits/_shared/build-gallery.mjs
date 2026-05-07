#!/usr/bin/env node
// Build starter-kits/starter-kits.json from per-kit metadata + each kit's
// routes.oas.json (for the actual mcpTools list).
//
// `MASTER` below is the authoritative list of kit attributes (domain, tier,
// replaces, seoQuery, description). Per-kit `mcpTools` is read from each
// kit's routes.oas.json so it always reflects what's actually wired up.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KITS_DIR = path.join(ROOT, "starter-kits");

const ALL = ["in-memory", "supabase", "firestore", "neon", "upstash-redis"];
const PA = ["in-memory", "clickhouse", "supabase", "neon"]; // product-analytics: clickhouse-first

/** @type {{slug: string, title: string, description: string, domain: string, tier: "S"|"M"|"L", replaces: string[], seoQuery: string, adapters: string[]}[]} */
const MASTER = [
  // HR / People (6)
  { slug: "pto-leave-management", title: "PTO & Leave Management API", description: "Track PTO requests, approvals, balances, and team coverage with MCP tools that find overlapping time off and check balances.", domain: "hr", tier: "M", replaces: ["BambooHR Time Off", "Vacation Tracker", "AbsenceSoft"], seoQuery: "api for pto tracking", adapters: ALL },
  { slug: "time-tracking", title: "Time Tracking & Timesheet API", description: "Time entries, projects, and timesheets with MCP tools that submit weekly timesheets and find unbilled hours.", domain: "hr", tier: "M", replaces: ["Harvest", "Toggl", "Clockify"], seoQuery: "api for time tracking", adapters: ALL },
  { slug: "applicant-tracking-system", title: "Applicant Tracking System API", description: "Jobs, candidates, applications, interviews, and scorecards with MCP tools to summarize and compare candidates and analyze pipeline health.", domain: "hr", tier: "L", replaces: ["Greenhouse", "Lever", "Ashby"], seoQuery: "open source ats api", adapters: ALL },
  { slug: "employee-onboarding", title: "Employee Onboarding API", description: "Hires, plans, and tasks with MCP tools that create onboarding plans, check overdue tasks, and notify buddies.", domain: "hr", tier: "L", replaces: ["Sapling", "ChartHop onboarding", "Workday onboarding"], seoQuery: "employee onboarding api", adapters: ALL },
  { slug: "performance-review", title: "Performance Review & 360 API", description: "Review cycles, goals, and 360 feedback with MCP tools to request peer feedback, summarize themes, and track goal progress.", domain: "hr", tier: "L", replaces: ["Lattice", "15Five", "Culture Amp"], seoQuery: "performance review api", adapters: ALL },
  { slug: "org-chart-directory", title: "Org Chart & People Directory API", description: "People, teams, and reporting lines with MCP tools to traverse the org chart and find owners + skip-level reports.", domain: "hr", tier: "M", replaces: ["ChartHop", "Pingboard", "BambooHR directory"], seoQuery: "org chart api", adapters: ALL },

  // Finance / Spend (7)
  { slug: "invoicing", title: "Invoicing API", description: "Invoices, line items, customers, and payments with MCP tools to chase overdue invoices and summarize AR aging.", domain: "finance", tier: "M", replaces: ["QuickBooks Invoicing", "FreshBooks", "Wave"], seoQuery: "api for invoicing", adapters: ALL },
  { slug: "expense-tracking", title: "Expense Tracking API", description: "Expenses, categories, policies, and reimbursements with MCP tools that flag policy violations and summarize pending approvals.", domain: "finance", tier: "L", replaces: ["Expensify", "Ramp expenses", "Brex expenses"], seoQuery: "api for expense management", adapters: ALL },
  { slug: "subscription-billing", title: "Subscription Billing API", description: "Plans, subscriptions, usage, and billing with MCP tools that forecast MRR, find at-risk subscriptions, and propose upgrades.", domain: "finance", tier: "L", replaces: ["Stripe Billing", "Chargebee", "Recurly"], seoQuery: "headless subscription billing api", adapters: ALL },
  { slug: "accounts-payable", title: "AP / Bill Pay API", description: "Vendors, bills, approvals, and payments with MCP tools that detect duplicates, summarize aging, and match bills to POs.", domain: "finance", tier: "L", replaces: ["Bill.com", "Melio", "Tipalti"], seoQuery: "accounts payable api", adapters: ALL },
  { slug: "corporate-card-spend", title: "Corporate Card / Spend Controls API", description: "Cards, transactions, and spend limits with MCP tools that find uncoded transactions and recommend limit changes.", domain: "finance", tier: "M", replaces: ["Ramp", "Brex", "Airbase"], seoQuery: "spend management api", adapters: ALL },
  { slug: "procurement-po", title: "Procurement / Purchase Order API", description: "Purchase requests, POs, and vendors with MCP tools that route approvals, flag maverick spend, and match invoices to POs.", domain: "finance", tier: "L", replaces: ["Coupa", "Procurify", "Airbase procurement"], seoQuery: "purchase order api", adapters: ALL },
  { slug: "donor-management", title: "Donor / Fundraising CRM API", description: "Donors, donations, campaigns, and pledges with MCP tools that identify lapsed donors, segment campaigns, and generate year-end receipts.", domain: "finance", tier: "M", replaces: ["Bloomerang", "Blackbaud", "DonorPerfect"], seoQuery: "donor management api", adapters: ALL },

  // Sales / CRM (6)
  { slug: "headless-crm", title: "Headless CRM API", description: "Accounts, contacts, deals, and activities with MCP tools that build account timelines, find warm intros, and summarize pipeline by owner.", domain: "sales", tier: "L", replaces: ["Salesforce", "HubSpot CRM", "Pipedrive"], seoQuery: "headless crm api", adapters: ALL },
  { slug: "sales-pipeline-forecast", title: "Sales Pipeline / Forecast API", description: "Deals, forecasts, snapshots, and quotas with MCP tools that roll up forecasts, flag at-risk deals, and compare week over week.", domain: "sales", tier: "L", replaces: ["Clari", "BoostUp", "Salesforce forecasting"], seoQuery: "sales forecast api", adapters: ALL },
  { slug: "quote-cpq", title: "Quote / CPQ API", description: "Quotes, pricing rules, products, and discounts with MCP tools that build quotes from requirements, route discount approvals, and explain pricing.", domain: "sales", tier: "L", replaces: ["Salesforce CPQ", "DealHub", "PandaDoc CPQ"], seoQuery: "cpq api", adapters: ALL },
  { slug: "lead-routing", title: "Lead Routing / SDR API", description: "Leads, routing rules, and territories with MCP tools that route leads intelligently, match leads to accounts, and surface unworked leads.", domain: "sales", tier: "M", replaces: ["Chili Piper", "LeanData", "Salesforce Flow routing"], seoQuery: "lead routing api", adapters: ALL },
  { slug: "sales-engagement-cadence", title: "Sales Engagement / Cadence API", description: "Cadences, prospects, and engagement tracking with MCP tools that personalize steps, build daily task briefs, and pause engaged replies.", domain: "sales", tier: "M", replaces: ["Outreach", "SalesLoft", "Apollo sequences"], seoQuery: "sales engagement api", adapters: ALL },
  { slug: "sales-commission", title: "Commission / Sales Comp API", description: "Comp plans, quotas, credits, and payouts with MCP tools that explain commission amounts, model what-ifs, and flag clawback risk.", domain: "sales", tier: "L", replaces: ["CaptivateIQ", "Spiff", "Xactly"], seoQuery: "commission api", adapters: ALL },

  // Customer Success / Support (4)
  { slug: "support-ticketing", title: "Customer Support Ticketing API", description: "Tickets, conversations, macros, and SLAs with MCP tools that triage incoming tickets, escalate with summary, and surface recurring issues.", domain: "customer-success", tier: "L", replaces: ["Zendesk", "Intercom", "Freshdesk"], seoQuery: "ticketing api", adapters: ALL },
  { slug: "customer-health", title: "Customer Health / Success API", description: "Accounts, health scores, signals, and playbooks with MCP tools that summarize account health, recommend playbooks, and predict churn risk.", domain: "customer-success", tier: "L", replaces: ["Gainsight", "ChurnZero", "Catalyst"], seoQuery: "customer health score api", adapters: ALL },
  { slug: "renewal-management", title: "Renewal Management API", description: "Contracts, renewal opportunities, and risk factors with MCP tools that prep renewal briefings, calculate uplift, and flag at-risk renewals.", domain: "customer-success", tier: "L", replaces: ["Gainsight Renewals", "Salesforce Renewal Cloud"], seoQuery: "renewal management api", adapters: ALL },
  { slug: "nps-feedback", title: "NPS / Customer Feedback API", description: "Surveys, responses, and follow-ups with MCP tools that cluster open responses, flag detractors for CSM, and compare cohorts.", domain: "customer-success", tier: "M", replaces: ["Delighted", "Wootric", "AskNicely"], seoQuery: "nps api", adapters: ALL },

  // Marketing / Growth (6)
  { slug: "email-campaign", title: "Email Campaign API", description: "Campaigns, subscribers, segments, and templates with MCP tools that summarize campaign performance, find at-risk subscribers, and propose send times.", domain: "marketing", tier: "L", replaces: ["Mailchimp", "Customer.io", "ConvertKit"], seoQuery: "api for email campaigns", adapters: ALL },
  { slug: "lead-capture-forms", title: "Lead Capture & Forms API", description: "Forms, submissions, webhooks, and spam rules with MCP tools that score leads, route to owners, and flag spam patterns.", domain: "marketing", tier: "M", replaces: ["Typeform", "Formspree", "HubSpot Forms"], seoQuery: "form backend api", adapters: ALL },
  { slug: "headless-cms", title: "Headless CMS API", description: "Content types, entries, and assets with MCP tools that find stale content, localize entries, and suggest internal links.", domain: "marketing", tier: "L", replaces: ["Contentful", "Sanity", "WordPress (headless)"], seoQuery: "headless cms api for blogs", adapters: ALL },
  { slug: "marketing-attribution", title: "Marketing Attribution API", description: "Touchpoints, visitors, and conversions with MCP tools that explain conversion paths, compare attribution models, and find underrated channels.", domain: "marketing", tier: "L", replaces: ["Dreamdata", "Attribution.com", "RollWorks"], seoQuery: "marketing attribution api", adapters: ALL },
  { slug: "ab-testing-flags", title: "A/B Testing & Feature Flag API", description: "Experiments, variants, flags, and assignments with MCP tools that interpret results, kill underperforming variants, and propose experiments.", domain: "marketing", tier: "M", replaces: ["Optimizely", "LaunchDarkly", "Statsig"], seoQuery: "self-hosted feature flag api", adapters: ALL },
  { slug: "product-analytics", title: "Product Analytics Events API", description: "Events, users, funnels, and cohorts with MCP tools that define funnels from a question, find drop-off steps, and compare cohorts.", domain: "marketing", tier: "L", replaces: ["Mixpanel", "Amplitude"], seoQuery: "event tracking api", adapters: PA },

  // IT / Operations (7)
  { slug: "it-asset-tracking", title: "IT Asset Tracking API", description: "Assets, assignments, and maintenance with MCP tools that assign laptops to hires, find unrecovered offboards, and schedule refresh cycles.", domain: "operations", tier: "M", replaces: ["Snipe-IT", "Asset Panda", "Lansweeper"], seoQuery: "asset tracking api", adapters: ALL },
  { slug: "it-helpdesk", title: "IT Helpdesk / Ticketing API", description: "Tickets, comments, KB articles, and SLAs with MCP tools that triage tickets, suggest KB answers, and escalate breaching SLAs.", domain: "operations", tier: "L", replaces: ["Zendesk Internal", "Freshservice", "ServiceNow ITSM"], seoQuery: "internal helpdesk api", adapters: ALL },
  { slug: "vendor-contract-management", title: "Vendor & Contract Management API", description: "Vendors, contracts, renewals, and risk assessments with MCP tools that flag upcoming renewals, compare vendor pricing, and calculate spend.", domain: "operations", tier: "L", replaces: ["Vendr", "Tropic", "Ironclad"], seoQuery: "vendor management api", adapters: ALL },
  { slug: "saas-management", title: "SaaS Management API", description: "SaaS apps, licenses, seats, and usage with MCP tools that find unused licenses, recommend seat reductions, and forecast renewal cost.", domain: "operations", tier: "L", replaces: ["Zylo", "Productiv", "Torii"], seoQuery: "saas management api", adapters: ALL },
  { slug: "incident-change-management", title: "Incident & Change Management API", description: "Incidents, changes, postmortems, and on-call with MCP tools that summarize timelines, assess change risk, and find current on-call.", domain: "operations", tier: "L", replaces: ["PagerDuty incidents", "ServiceNow Change", "FireHydrant"], seoQuery: "incident management api", adapters: ALL },
  { slug: "compliance-audit-evidence", title: "Compliance & Audit Evidence API", description: "Controls, evidence, audit cycles, and findings with MCP tools that flag stale evidence, map evidence to controls, and draft audit responses.", domain: "operations", tier: "L", replaces: ["Vanta", "Drata", "Secureframe"], seoQuery: "soc2 evidence api", adapters: ALL },
  { slug: "status-page", title: "Status Page API", description: "Components, incidents, maintenance, and subscribers with MCP tools that open incidents from alerts, draft customer updates, and post postmortem summaries.", domain: "operations", tier: "M", replaces: ["Statuspage.io", "Instatus", "Atlassian Statuspage"], seoQuery: "api for status page", adapters: ALL },

  // Productivity / Internal Tools (5)
  { slug: "internal-wiki", title: "Internal Wiki / Docs API", description: "Spaces, pages, revisions, and comments with MCP tools that find canonical pages, flag outdated content, and merge duplicates.", domain: "productivity", tier: "L", replaces: ["Notion", "Confluence", "Slab"], seoQuery: "api for internal wiki", adapters: ALL },
  { slug: "task-project-management", title: "Task / Project Management API", description: "Projects, tasks, subtasks, comments, and labels with MCP tools that summarize sprints, chase stale tasks, and rebalance workload.", domain: "productivity", tier: "M", replaces: ["Asana", "Trello", "Linear"], seoQuery: "api for task management", adapters: ALL },
  { slug: "scheduling-booking", title: "Scheduling / Booking API", description: "Event types, availability, and bookings with MCP tools that find mutual slots, reschedule around conflicts, and enforce meeting budgets.", domain: "productivity", tier: "L", replaces: ["Calendly", "Cal.com"], seoQuery: "calendly alternative api", adapters: ALL },
  { slug: "survey-poll", title: "Survey & Poll API", description: "Surveys, questions, and responses with MCP tools that cluster open responses, compare cohorts, and propose follow-up questions.", domain: "productivity", tier: "M", replaces: ["SurveyMonkey", "Polly", "Slido"], seoQuery: "api for surveys", adapters: ALL },
  { slug: "announcements-changelog", title: "Internal Announcements / Changelog API", description: "Announcements, audiences, and acknowledgements with MCP tools that find unread critical announcements, summarize the week, and draft changelogs.", domain: "productivity", tier: "S", replaces: ["Headway", "Beamer"], seoQuery: "api for changelog", adapters: ALL },

  // Verticals / Long-tail (9)
  { slug: "legal-matter-management", title: "Legal Matter Management API", description: "Matters, clients, deadlines, and documents with MCP tools that check conflicts before intake, summarize matter status, and draft client letters.", domain: "vertical", tier: "L", replaces: ["Clio", "MyCase", "PracticePanther"], seoQuery: "api for legal matter management", adapters: ALL },
  { slug: "real-estate-listings", title: "Real Estate / Property Listings API", description: "Listings, leads, showings, and offers with MCP tools that match leads to listings, draft offer summaries, and schedule showing rounds.", domain: "vertical", tier: "L", replaces: ["Follow Up Boss", "kvCORE"], seoQuery: "api for real estate listings", adapters: ALL },
  { slug: "student-course-management", title: "Student / Course Management API", description: "Students, courses, enrollments, lessons, and grades with MCP tools that flag at-risk students, draft progress reports, and recommend remediation.", domain: "vertical", tier: "M", replaces: ["TeachWorks", "Thinkific admin", "Google Classroom"], seoQuery: "api for course management", adapters: ALL },
  { slug: "patient-intake", title: "Patient Intake / Healthcare Admin API", description: "Patients, intake forms, consents, insurance, and appointments with MCP tools that verify insurance pre-visit, summarize intake, and flag missing consents. NOT a substitute for HIPAA compliance work.", domain: "vertical", tier: "L", replaces: ["Jotform HIPAA", "Phreesia"], seoQuery: "api for patient intake", adapters: ALL },
  { slug: "event-ticketing", title: "Event Ticketing API", description: "Events, ticket types, orders, and check-ins with MCP tools that forecast attendance, issue segment discounts, and triage refunds.", domain: "vertical", tier: "M", replaces: ["Eventbrite", "Ticket Tailor"], seoQuery: "api for event ticketing", adapters: ALL },
  { slug: "ecommerce-order-ops", title: "E-commerce Order Ops API", description: "Orders, shipments, returns, and inventory with MCP tools that triage high-risk orders, pick carriers, and auto-approve returns under policy.", domain: "vertical", tier: "L", replaces: ["ShipStation", "Order Desk"], seoQuery: "api for order management", adapters: ALL },
  { slug: "restaurant-reservations", title: "Restaurant Reservations API", description: "Reservations, tables, guests, and waitlists with MCP tools that optimize floor plans for shifts, recognize VIP guests, and recover no-show revenue.", domain: "vertical", tier: "L", replaces: ["OpenTable", "Resy", "Tock"], seoQuery: "api for restaurant reservations", adapters: ALL },
  { slug: "field-service", title: "Field Service / Inspection API", description: "Jobs, technicians, inspections, and invoices with MCP tools that optimize routes, flag recurring failures at sites, and draft estimates from inspections.", domain: "vertical", tier: "L", replaces: ["ServiceTitan", "Jobber", "Housecall Pro"], seoQuery: "api for field service", adapters: ALL },
  { slug: "community-forum", title: "Community / Forum API", description: "Topics, posts, members, and reactions with MCP tools that summarize unread for a user, find unanswered questions, and nominate helpful members.", domain: "vertical", tier: "M", replaces: ["Discourse", "Circle", "Tribe"], seoQuery: "api for community forum", adapters: ALL },
];

function mcpToolsForKit(slug) {
  const routesPath = path.join(KITS_DIR, slug, "config/routes.oas.json");
  const oas = JSON.parse(fs.readFileSync(routesPath, "utf8"));
  const tools = [];
  for (const methods of Object.values(oas.paths || {})) {
    for (const op of Object.values(methods)) {
      const m = op["x-zuplo-route"]?.mcp;
      if (m && (m.type === "tool" || m.type === "prompt" || m.type === "resource")) {
        tools.push(op.operationId);
      }
    }
  }
  return tools;
}

const today = new Date().toISOString().slice(0, 10);

const starterKits = MASTER.map((m) => ({
  ...m,
  mcpTools: mcpToolsForKit(m.slug),
  iconUrl: "https://cdn.zuplo.com/static/logos/icon-pink-framed.png",
  date: today,
}));

const out = {
  $schema: "./starter-kits.schema.json",
  domains: [
    { slug: "hr", title: "HR / People" },
    { slug: "finance", title: "Finance / Spend" },
    { slug: "sales", title: "Sales / CRM" },
    { slug: "customer-success", title: "Customer Success / Support" },
    { slug: "marketing", title: "Marketing / Growth" },
    { slug: "operations", title: "IT / Operations" },
    { slug: "productivity", title: "Productivity / Internal Tools" },
    { slug: "vertical", title: "Verticals / Long-tail" },
  ],
  starterKits,
};

fs.writeFileSync(path.join(KITS_DIR, "starter-kits.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${starterKits.length} kits to starter-kits.json`);
console.log("Domains:", Object.fromEntries(
  starterKits.reduce((m, k) => m.set(k.domain, (m.get(k.domain) ?? 0) + 1), new Map())
));
