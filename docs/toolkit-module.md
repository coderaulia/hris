# Product Requirements Document (PRD)

Product: HR Toolkit Modules
Version: MVP v1
Goal: Enable HR and superadmin users to generate standardized HR documents and basic evaluation/compensation structures in <5 minutes per task inside this HRIS project.

## 1. Objectives

Business Goals
Reduce HR document creation time by ≥70%
Standardize HR documentation across teams
Enable non-HR founders to perform HR tasks
User Goals
Generate accurate documents quickly
Avoid manual formatting (Word/Excel)
Maintain compliance (basic Indonesia context)

## 2. Target Users

HR Admin / HR Generalist
HRBP
Startup founders / Ops

## 3. Core Modules Scope

### A. HR Documents Module

#### A1. Offer Letter Generator

Description

Generate standardized offer letters from structured inputs.

Inputs
Candidate name
Position
Department
Salary (base + allowance)
Employment type (PKWT/PKWTT/Intern)
Start date
Probation period
Reporting manager
Outputs
PDF document
Editable preview (HTML)
Key Features
Template-based generation
Auto document numbering
Save to employee record (optional)
Success Metrics
Time to generate < 3 minutes
95% error-free usage (no manual edits needed)

#### A2. Contract Generator

Description

Generate employment contracts.

Types
PKWT (fixed-term)
PKWTT (permanent)
Internship
Freelance
Inputs
Employee data
Contract duration
Salary terms
Working hours
Clauses toggle (NDA, non-compete)
Outputs
PDF contract
Versioned document
Key Features
Clause-based modular system
Localization (Indonesia law-ready baseline)

#### A3. Payslip Generator

Description

Generate monthly payslips.

Inputs
Employee name
Salary breakdown:
Base salary
Allowances
Overtime
Deductions (BPJS, tax)
Outputs
PDF payslip
Monthly archive
Key Features
Bulk generation (CSV upload) – optional stretch
Auto calculation (basic)
Constraints
No full payroll system (MVP scope)

#### A4. Warning Letter (SP) Generator

Description

Generate disciplinary letters.

Types
SP1
SP2
SP3
Inputs
Employee name
Violation type
Incident date
Description
Issuer
Outputs
Formal warning letter PDF
Key Features
Predefined tone (legal/formal)
Case history linkage (future scope)

#### A5. Termination Letter Generator

Description

Generate employee termination documents.

Types
Resignation acceptance
Contract end
Termination (PHK)

Inputs

Employee name
Termination type
Effective date
Reason
Final compensation (optional)

Outputs

PDF letter
Risk
Legal sensitivity → must include disclaimer

### B. Salary Structure Builder

Description

Tool to define internal salary bands and job grading.

Inputs

Job levels (Intern, Junior, Staff, Senior, Manager)
Salary ranges (min–max)
Allowance structure
Department mapping

Outputs

Salary band table
Export (CSV / PDF)
Key Features
Editable grid interface
Versioning (v1, v2 structure)
Internal sharing view
Success Metrics
Setup time < 30 minutes
Used as reference in ≥80% hiring decisions

### C. Interview Evaluation Tool

Description

Standardize candidate evaluation.

Inputs

Candidate name
Position
Interviewer
Score categories:
Technical skill
Communication
Culture fit
Experience relevance
Scoring
Scale (1–5 or 1–10)

Outputs

Evaluation summary
Final recommendation:
Hire
Consider
Reject
Key Features
Weighted scoring
Comment field per category
Export report
Success Metrics
Reduce bias (consistent scoring usage)
Adoption by ≥70% interviewers 4. Functional Requirements
Users can:
Create, edit, preview, download documents
Save templates
Store generated documents per employee (optional MVP+)
System supports:
Dynamic templating (variables injection)
PDF export
Basic data persistence 5. Non-Functional Requirements
Performance: <2s document generation
Security: Role-based access (basic)
Storage: Secure document storage
Localization: Bahasa Indonesia (default)

## 6. MVP Scope (Must Have)

### Included:

Offer Letter Generator
Contract Generator (PKWT + PKWTT only)
Payslip Generator (single)
Warning Letter Generator
Termination Letter Generator
Salary Structure Builder (basic)
Interview Evaluation Tool

### Excluded:

E-signature
Payroll automation
Legal compliance engine
Multi-language
Bulk payslip (optional next phase) 7. Future Enhancements
E-sign integration
Employee database integration
Document templates marketplace
HR analytics integration
Compliance checker (Indonesia labor law) 8. Suggested Data Model (High-Level)

### Entities:

Employee
Document
Template
SalaryStructure
InterviewEvaluation

### Relationships:

Employee → Documents (1:N)
Template → Documents (1:N)
Employee → InterviewEvaluation (1:N)
