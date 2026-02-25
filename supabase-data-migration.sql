-- ==================================================
-- DATA MIGRATION — Employees + Competency Config
-- Run AFTER supabase-schema.sql
-- ==================================================

-- ===== PART 1: EMPLOYEES =====
INSERT INTO employees (employee_id, name, join_date, seniority, position, department, manager_id, role, percentage, scores, self_scores, self_percentage, self_date, training_history, history, date_created, date_updated, date_next) VALUES

('220401', 'Putu Pradnyaningrum Pinatih', '2022-01-31', 'Manager', 'Creator Manager', 'GMV Based', NULL, 'manager', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('220607', 'Dyna Novita Lumban Gaol', '2022-06-12', 'Manager', 'Finance & Accounting', 'Direct Report', NULL, 'manager', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('230603', 'Bagus Adi Nugraha', '2023-06-21', 'Manager', 'Business Development', 'Business Dev', NULL, 'manager', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('241002', 'I Putu Dede Udayana Laksmana Putra', '2024-10-24', 'Manager', 'Strategy Manager', 'Strategy & Support', NULL, 'manager', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250606', 'Aulia Satrio Wibowo', '2025-06-29', 'Manager', 'HR Business Partner', 'Direct Report', NULL, 'superadmin', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250703', 'Oloppy Simanjuntak', '2025-07-22', 'Manager', 'Project & Operation Manager', 'Project Based', NULL, 'manager', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),

('240901', 'Ananda Fitri Bashirah', '2024-09-01', 'Senior', 'Business Development', 'Business Dev', '230603', 'employee', 50,
  '[{"q":"Business Development Strategy","s":5,"n":""},{"q":"Client Relationship Management","s":5,"n":""},{"q":"Contract Negotiation","s":5,"n":""},{"q":"CRM Software, Social Media Analytics","s":5,"n":""},{"q":"Sales Management","s":5,"n":""},{"q":"Google Spreadsheet","s":5,"n":""},{"q":"Google Slides/Powerpoint","s":5,"n":""},{"q":"Market Research","s":5,"n":""}]',
  '[{"q":"Business Development Strategy","s":6,"n":""},{"q":"Client Relationship Management","s":7,"n":""},{"q":"Contract Negotiation","s":5,"n":""},{"q":"CRM Software, Social Media Analytics","s":5,"n":""},{"q":"Sales Management","s":5,"n":""},{"q":"Google Spreadsheet","s":5,"n":""},{"q":"Google Slides/Powerpoint","s":5,"n":""},{"q":"Market Research","s":5,"n":""}]',
  54, '2026-01-18',
  '[{"course":"HubSpot CRM Certification or Meta Social Media Marketing Professional Certificate","start":"2026-01-18","end":"","provider":"External","status":"approved"}]',
  '[]', '2026-01-18', '2026-01-18', '2026-07-18'),

('240502', 'Hilda Aulia Anwar', '2024-05-12', 'Senior', 'KOL Affiliates & Community Specialist', 'Project Based', '250703', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('240601', 'Fitri Nopita Sari', '2024-06-17', 'Junior', 'Data Analyst', 'Strategy & Support', '241002', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('240805', 'Rio Mangasih Rotama LBN Tobing', '2024-08-21', 'Senior', 'KOL Affiliates & Community Specialist', 'Project Based', '250703', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('240902', 'Anggita Amilia Purnama', '2024-09-08', 'Senior', 'Creator Manager', 'GMV Based', '220401', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('240904', 'Nadia', '2024-09-17', 'Junior', 'KOL Affiliates & Community Specialist', 'Project Based', '250703', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250605', 'Shafira Julia Riyanto', '2025-06-15', 'Junior', 'KOL Affiliates & Community Specialist', 'Project Based', '250703', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250702', 'Roberto Albertinus', '2025-07-20', 'Junior', 'Business Development', 'Business Dev', '230603', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250801', 'Salma Nafissa', '2025-08-03', 'Senior', 'KOL Affiliates & Community Specialist', 'Project Based', '250703', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250901', 'Ardhia Aprilia Dewi', '2025-08-31', 'Senior', 'Data Analyst', 'Strategy & Support', '241002', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('250902', 'Juwita Mariska Kristiani Zebua', '2025-09-14', 'Junior', 'Creator Manager', 'GMV Based', '220401', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('251002', 'Muhammad Faris', '2025-09-30', 'Junior', 'Videographer & Editor', 'Creative & Ops', '250903', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('251003', 'Christy Adelina Purba', '2025-10-19', 'Junior', 'Creator Manager', 'GMV Based', '220401', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-'),
('251201', 'Desty', '2025-12-07', 'Junior', 'KOL Affiliates & Community Specialist', 'Project Based', '250703', 'employee', 0, '[]', '[]', 0, NULL, '[]', '[]', '-', '-', '-')

ON CONFLICT (employee_id) DO UPDATE SET
  name = EXCLUDED.name, join_date = EXCLUDED.join_date, seniority = EXCLUDED.seniority,
  position = EXCLUDED.position, department = EXCLUDED.department, manager_id = EXCLUDED.manager_id,
  role = EXCLUDED.role, percentage = EXCLUDED.percentage, scores = EXCLUDED.scores,
  self_scores = EXCLUDED.self_scores, self_percentage = EXCLUDED.self_percentage,
  self_date = EXCLUDED.self_date, training_history = EXCLUDED.training_history,
  history = EXCLUDED.history, date_created = EXCLUDED.date_created,
  date_updated = EXCLUDED.date_updated, date_next = EXCLUDED.date_next;


-- ===== PART 2: COMPETENCY CONFIG =====

INSERT INTO competency_config (position_name, competencies) VALUES

('KOL Affiliates & Community Specialist', '[
  {"name":"Google Sheets","rec":"Data Analysis with Google Sheets","desc":"Ability to organize, analyze, and visualize affiliate performance data using formulas, pivot tables, and charts."},
  {"name":"Community Management","rec":"CMX Community Management Certification or Meta Certified Community Manager","desc":"Skills in building, moderating, and engaging online communities to foster brand loyalty and activity."},
  {"name":"KOL Recruitment and Administration","rec":"Influencer Marketing II: Paid Strategies (HubSpot)","desc":"Process of identifying, outreach, negotiating, and onboarding Key Opinion Leaders (KOLs) effectively."},
  {"name":"Affiliate Campaign Management","rec":"Authority Hacker Affiliate Marketing or ClickBank Spark Certification","desc":"Managing affiliate programs, tracking commissions, and optimizing campaign performance to maximize ROI."},
  {"name":"TikTok Dashboard","rec":"TikTok Shop Partner Training","desc":"Proficiency in navigating TikTok Seller Center/Affiliate backend to track sales, traffic, and creator performance."},
  {"name":"Shopee Dashboard","rec":"Shopee Affiliate Program Official Guides","desc":"Ability to use Shopee''s affiliate platform for link generation, commission tracking, and performance reporting."},
  {"name":"Communication Skills","rec":"Effective Business Communication (Coursera) or Dale Carnegie Effective Communications","desc":"Clarity in negotiation, briefing, and maintaining professional relationships with external partners and creators."}
]'::jsonb),

('Business Development', '[
  {"name":"Business Development Strategy","rec":"Business Strategy Specialization (Coursera/UVA) or Strategic Management Certification (AMA)","desc":"Formulating long-term plans to identify new business opportunities, markets, and revenue streams."},
  {"name":"Client Relationship Management","rec":"HubSpot Sales Software Certification or Salesforce Sales Operations","desc":"maintaining positive relationships with existing clients to ensure satisfaction and retention."},
  {"name":"Contract Negotiation","rec":"Successful Negotiation: Essential Strategies and Skills (University of Michigan) or Karrass Negotiating Seminar","desc":"Reaching mutually beneficial agreements on terms, pricing, and deliverables with partners."},
  {"name":"CRM Software, Social Media Analytics","rec":"HubSpot CRM Certification or Meta Social Media Marketing Professional Certificate","desc":"Using tools to manage leads (CRM) and interpreting social data to pitch relevant solutions to clients."},
  {"name":"Sales Management","rec":"Sales Management Training (HubSpot Academy) or Certified Sales Professional (CSP)","desc":"Overseeing the sales pipeline, setting targets, and executing strategies to meet revenue goals."},
  {"name":"Google Spreadsheet","rec":"Google Sheets Advanced Data Analysis (Coursera) or Spreadsheet Modeling (Harvard Business Publishing)","desc":"Advanced data manipulation for sales forecasting, pipeline tracking, and revenue reporting."},
  {"name":"Google Slides/Powerpoint","rec":"Storytelling with Data or McKinsey Problem Solving & Presentation","desc":"Creating compelling, professional pitch decks and presentations for high-stakes client meetings."},
  {"name":"Market Research","rec":"Market Research Specialization (UC Davis)","desc":"Analyzing market trends, competitor activities, and customer needs to inform business strategy."}
]'::jsonb),

('Data Analyst', '[
  {"name":"Analytical thinking","rec":"Critical Thinking & Problem Solving for Business","desc":"Ability to break down complex problems into manageable parts and interpret data logically."},
  {"name":"Data analytical","rec":"Google Data Analytics Professional Certificate","desc":"Technical process of cleaning, transforming, and modeling data to discover useful information."},
  {"name":"Google Spreadsheets","rec":"Advanced Google Sheets for Data Analysis","desc":"Mastery of advanced formulas (Query, ArrayFormula), automation, and data structuring."},
  {"name":"Google Slides/Powerpoint","rec":"Data Visualization and Dashboarding","desc":"Translating complex data findings into easy-to-understand visual stories for stakeholders."},
  {"name":"Excel Formula","rec":"Microsoft Office Specialist: Excel Expert","desc":"Deep knowledge of spreadsheet functions for financial modeling and complex data processing."},
  {"name":"Python","rec":"Python for Data Science, AI & Development (IBM) or PCAP (Certified Associate in Python Programming)","desc":"Using Python scripts for data automation, scraping, or advanced statistical analysis."},
  {"name":"Looker Studio","rec":"Google Cloud Looker Studio Training or Data Visualization with Looker (Udemy)","desc":"Building interactive, real-time dashboards to visualize key performance indicators (KPIs)."},
  {"name":"Shopee & TikTok Dashboard","rec":"E-commerce Analytics & Data Scraper Tools Training","desc":"Extracting and interpreting specific e-commerce metrics (GMV, conversion rates) from platform backends."}
]'::jsonb),

('HR Business Partner', '[
  {"name":"End-to-end Recruitment Process","rec":"Talent Acquisition Specialty (SHRM) or LinkedIn Recruiter Training","desc":"Managing the entire hiring lifecycle from sourcing candidates to onboarding new hires."},
  {"name":"Employer Branding","rec":"Employer Branding Strategies (Universum)","desc":"Building and promoting the company''s reputation as a desirable place to work."},
  {"name":"HR Planning","rec":"Strategic Human Resources Management (Macquarie University)","desc":"Aligning human resource strategies with the overall business objectives and goals."},
  {"name":"Training and Development","rec":"Certified Professional in Talent Development (CPTD)","desc":"Identifying skill gaps and designing programs to improve employee performance and growth."},
  {"name":"Manpower Planning","rec":"Workforce Planning and Analytics","desc":"Forecasting future staffing needs to ensure the organization has the right people at the right time."},
  {"name":"Compensation and Benefit","rec":"Certified Compensation Professional (CCP)","desc":"Designing and managing salary structures, insurance, and other employee perks."},
  {"name":"Performance Appraisal","rec":"Performance Management Systems Design","desc":"Developing and overseeing systems to evaluate and improve employee job performance."},
  {"name":"Organization Development (KPI, OKR, Working Culture)","rec":"Organizational Development Certification Program (ODCP) or OKR Certified Coach","desc":"Improving organizational health through culture building, KPI/OKR setting, and change management."},
  {"name":"Company Policies","rec":"Certified Industrial Relations Professional (Indonesia Context: Hubungan Industrial & UU Cipta Kerja)","desc":"Ensuring compliance with Indonesian labor laws (UU Cipta Kerja) and creating internal regulations."}
]'::jsonb),

('Livestreaming Operator', '[
  {"name":"Schedule management","rec":"Project Management Fundamentals or Google Calendar Power User","desc":"Organizing streaming slots, host shifts, and ensuring punctuality of broadcasts."},
  {"name":"Sales Strategy","rec":"Live Shopping Sales Techniques (TikTok Shop Academy) or Consultative Selling","desc":"Implementing tactics (flash sales, vouchers) during streams to maximize conversion rates."},
  {"name":"OBS (Open Broadcasting Software)","rec":"OBS Studio Masterclass (Udemy) or Streamlabs University","desc":"Technical proficiency in setting up scenes, audio mixing, and streaming outputs."},
  {"name":"Videography","rec":"Lighting & Composition for Live Streaming","desc":"Knowledge of camera angles, lighting setup, and visual composition for live video."},
  {"name":"Google Slides","rec":"Presentation Design for Non-Designers","desc":"Creating on-screen assets, banners, or running text for the livestream."},
  {"name":"Presentation Skills","rec":"Public Speaking for Live Streaming or Host/Presenter Training","desc":"Ability to brief hosts or step in to present products engagingly on camera."}
]'::jsonb),

('Art Director', '[
  {"name":"Leadership","rec":"Creative Leadership (IDEO U) or Leading Creative Teams","desc":"Guiding the creative vision and motivating the design team to achieve high quality."},
  {"name":"Social Media Trends","rec":"Social Media Marketing Specialization (Northwestern University) or TikTok Trend Analysis","desc":"Staying updated with current visual trends on TikTok/IG to keep content relevant."},
  {"name":"Team Management","rec":"Managing Creative Teams or Agile for Creative Agencies","desc":"Allocating resources, managing deadlines, and resolving conflicts within the creative team."},
  {"name":"Content Creating/Production","rec":"Production Management for TV and Film","desc":"Overseeing the end-to-end production process from concept to final export."},
  {"name":"Performance Tracking","rec":"Marketing Analytics (Meta) or Creative Performance Analysis","desc":"Analyzing which visual elements drive the best engagement and adjusting strategy accordingly."},
  {"name":"Presentation & Pitching Skills","rec":"Pitching to Win or The Art of Persuasion","desc":"Effectively communicating creative concepts to stakeholders or clients."},
  {"name":"Technical & Creative Concept","rec":"Creative Direction Masterclass or Conceptual Thinking for Designers","desc":"Translating abstract ideas into concrete visual directions and technical requirements."}
]'::jsonb),

('Videographer & Editor', '[
  {"name":"Content Creating","rec":"Storytelling for Content Creators (Skillshare) or Viral Video Editing Strategy","desc":"Ideating and filming engaging video content tailored for social platforms."},
  {"name":"Video Editing","rec":"Adobe Certified Professional in Video Design or The Art of Video Editing","desc":"Assembling footage, adding transitions, and refining the final cut for storytelling."},
  {"name":"Graphic Design","rec":"Graphic Design Specialization (CalArts) or Canva Design School (for quick assets)","desc":"Creating static assets, thumbnails, or text overlays to support video content."},
  {"name":"Time Management","rec":"Productivity & Time Management for Creatives","desc":"Prioritizing editing tasks to meet tight production deadlines."},
  {"name":"CapCut","rec":"CapCut Mobile Video Editing Masterclass","desc":"Proficiency in rapid, trend-based editing using mobile-first tools."},
  {"name":"Adobe Premiere","rec":"Adobe Premiere Pro CC: The Complete Guide (CreativeLive) or Adobe Certified Professional (ACP)","desc":"Advanced editing skills for professional-grade video production."},
  {"name":"Motion Graphic","rec":"After Effects Kickstart (School of Motion) or Motion Design Fundamentals","desc":"Adding animated elements and visual effects to enhance video engagement."}
]'::jsonb),

('Creator Manager', '[
  {"name":"Google Sheets","rec":"Data Analysis with Google Sheets","desc":"Tracking creator rosters and performance metrics using spreadsheet tools."},
  {"name":"KOL Recruitment and Administration","rec":"Influencer Marketing II: Paid Strategies (HubSpot)","desc":"Scouting, contacting, and managing administrative tasks for new creators."},
  {"name":"Affiliate Campaign Management","rec":"Authority Hacker Affiliate Marketing or ClickBank Spark Certification","desc":"Strategizing and executing campaigns to drive affiliate sales through creators."},
  {"name":"TikTok Dashboard","rec":"TikTok Shop Partner Training","desc":"Monitoring creator live/video performance via the TikTok backend."},
  {"name":"Shopee Dashboard","rec":"Shopee Affiliate Program Official Guides","desc":"Managing creator links and performance on the Shopee platform."},
  {"name":"Communication Skills","rec":"Effective Business Communication (Coursera) or Dale Carnegie Effective Communications","desc":"Building strong, motivating relationships with managed creators."}
]'::jsonb),

('Strategy Manager', '[
  {"name":"Leadership","rec":"Strategic Leadership and Management","desc":"Executive-level decision making and organizational influence."},
  {"name":"Workload & Team Management","rec":"Agile Project Management","desc":"Methodologies like Scrum or Kanban to manage complex strategic initiatives."},
  {"name":"Project & Dashboard management","rec":"Google Project Management Certificate","desc":"Standardizing project tracking and reporting across the organization."},
  {"name":"Google Spreadsheet","rec":"Financial Modeling in Google Sheets","desc":"Building complex models to forecast revenue and business scenarios."},
  {"name":"Google Slides/Powerpoint","rec":"Strategic Storytelling (McKinsey Style)","desc":"Structuring high-stakes presentations for executive review."},
  {"name":"Analytical Thinking","rec":"Strategic Business Analytics","desc":"Using statistical data to inform long-term business strategy."},
  {"name":"Presentation & Pitching","rec":"Persuasive Presentation Skills","desc":"Advanced public speaking and argumentation for selling strategies."}
]'::jsonb),

('Finance & Accounting', '[
  {"name":"Account Receivables","rec":"Accounts Receivable Management Best Practices","desc":"Strategies for efficient credit monitoring, invoicing, and effective debt collection to improve cash flow."},
  {"name":"Account Payables","rec":"Certified Accounts Payable Professional (CAPP) or AP Automation","desc":"Best practices for invoice processing, vendor management, and optimizing payment cycles."},
  {"name":"Budget Management","rec":"Budgeting and Forecasting (Corporate Finance Institute/CFI)","desc":"Comprehensive training on creating operating budgets, variance analysis, and cost control."},
  {"name":"Tax Management","rec":"Brevet Pajak A & B (Tax Brevet Certification)","desc":"Essential certification for Indonesian tax laws, covering Income Tax (PPh), VAT (PPN), and reporting compliance."},
  {"name":"Petty Cash","rec":"Internal Controls & Cash Management","desc":"establishing robust standard operating procedures (SOPs) and safeguards for handling small cash transactions."},
  {"name":"Payroll","rec":"PPh 21 Calculation & Payroll Administration","desc":"Technical training on calculating Indonesian income tax, BPJS contributions, and using payroll software."},
  {"name":"Finance Forecasting","rec":"Financial Modeling & Valuation Analyst (FMVA)","desc":"Advanced certification for building complex financial models to predict future business performance and support decision-making."}
]'::jsonb),

('Project & Operation Manager', '[
  {"name":"Leadership","rec":"Project Leadership (PMI/LinkedIn Learning)","desc":"Techniques for motivating cross-functional teams and managing stakeholders without formal authority."},
  {"name":"Project & Campaign Management","rec":"Project Management Professional (PMP)","desc":"The gold standard certification covering the entire project lifecycle from initiation to closing."},
  {"name":"Workload & Team Management","rec":"Agile Certified Practitioner (PMI-ACP)","desc":"Managing dynamic workflows using Scrum or Kanban methodologies to optimize team capacity."},
  {"name":"Presentation","rec":"Effective Business Presentations (Toastmasters)","desc":"Structuring clear status updates, risk reports, and post-mortem analyses for stakeholders."},
  {"name":"Problem Solving","rec":"Lean Six Sigma Green Belt","desc":"Data-driven methodologies (DMAIC) for identifying bottlenecks and improving operational process efficiency."},
  {"name":"Project Planning & Strategies","rec":"Strategic Project Management (Rice University)","desc":"Skills for aligning project execution with broader organizational goals and creating long-term roadmaps."}
]'::jsonb)

ON CONFLICT (position_name) DO UPDATE SET
  competencies = EXCLUDED.competencies;
