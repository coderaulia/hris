import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);

function readArg(flag, fallback = '') {
    const index = argv.indexOf(flag);
    if (index === -1) return fallback;
    return String(argv[index + 1] || fallback).trim();
}

function hasFlag(flag) {
    return argv.includes(flag);
}

const profileName = (readArg('--profile', process.env.STRESS_PROFILE || 'average') || 'average').toLowerCase();
const profiles = {
    average: {
        key: 'AVG',
        employees: 120,
        planCount: 16,
        requestCount: 18,
        recruitmentCount: 28,
        managerAssessmentRatio: 0.62,
        selfAssessmentRatio: 0.28,
        targetPeriods: ['2026-01', '2026-02', '2026-03'],
    },
    busy: {
        key: 'BUSY',
        employees: 220,
        planCount: 26,
        requestCount: 40,
        recruitmentCount: 72,
        managerAssessmentRatio: 0.82,
        selfAssessmentRatio: 0.44,
        targetPeriods: ['2026-01', '2026-02', '2026-03'],
    },
};

const profile = profiles[profileName];
if (!profile) {
    console.error(`Unknown stress profile "${profileName}". Use "average" or "busy".`);
    process.exit(1);
}

const requestedEmployees = Number(readArg('--employees', process.env.STRESS_EMPLOYEES || profile.employees));
const employeeCount = Number.isFinite(requestedEmployees) && requestedEmployees >= 100 && requestedEmployees <= 250
    ? Math.round(requestedEmployees)
    : profile.employees;

const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
    console.error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) are required.');
    process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

const employeePrefix = `QA-STRESS-${profile.key}-EMP-`;
const requestPrefix = `QA-STRESS-${profile.key}-REQ-`;
const planNotePrefix = `[QA-STRESS ${profile.key}]`;
const candidatePrefix = `QA Stress ${profile.key}`;
const stressEmployeeEmail = `qa.stress.${profileName}.employee@demo.local`;
const stressEmployeePassword = 'Employee123!';
const stressEmployeeDoneEmail = `qa.stress.${profileName}.done@demo.local`;

const positions = [
    { department: 'IT', position: 'Frontend Engineer', seniority: 'Intermediate', managerEmail: 'eng.manager@demo.local' },
    { department: 'IT', position: 'Backend Engineer', seniority: 'Senior', managerEmail: 'eng.manager@demo.local' },
    { department: 'IT', position: 'QA Engineer', seniority: 'Intermediate', managerEmail: 'eng.manager@demo.local' },
    { department: 'IT', position: 'DevOps Engineer', seniority: 'Senior', managerEmail: 'eng.manager@demo.local' },
    { department: 'Sales', position: 'Sales Executive', seniority: 'Intermediate', managerEmail: 'sales.manager@demo.local' },
    { department: 'Sales', position: 'Account Executive', seniority: 'Intermediate', managerEmail: 'sales.manager@demo.local' },
    { department: 'Sales', position: 'Partnership Associate', seniority: 'Junior', managerEmail: 'sales.manager@demo.local' },
    { department: 'Marketing', position: 'Marketing Specialist', seniority: 'Intermediate', managerEmail: 'director@demo.local' },
    { department: 'Marketing', position: 'Content Strategist', seniority: 'Intermediate', managerEmail: 'director@demo.local' },
    { department: 'Operations', position: 'Operations Analyst', seniority: 'Intermediate', managerEmail: 'director@demo.local' },
    { department: 'Operations', position: 'Operations Specialist', seniority: 'Junior', managerEmail: 'director@demo.local' },
    { department: 'HR', position: 'HR Generalist', seniority: 'Intermediate', managerEmail: 'hr@demo.local' },
    { department: 'Finance', position: 'Finance Analyst', seniority: 'Intermediate', managerEmail: 'director@demo.local' },
    { department: 'Finance', position: 'Accountant', seniority: 'Senior', managerEmail: 'director@demo.local' },
];

const firstNames = ['Ari', 'Bela', 'Cahya', 'Dion', 'Eris', 'Fina', 'Gilang', 'Hana', 'Ilham', 'Jodi', 'Karin', 'Lana', 'Miko', 'Nadia', 'Oki', 'Prita', 'Qori', 'Rafi', 'Sinta', 'Tama'];
const lastNames = ['Aditya', 'Pranata', 'Wijaya', 'Lestari', 'Saputra', 'Maharani', 'Kurnia', 'Rahma', 'Putra', 'Saputri', 'Ramadhan', 'Permata', 'Nugraha', 'Wibowo', 'Sari', 'Kusuma'];

function chunk(array, size = 250) {
    const output = [];
    for (let index = 0; index < array.length; index += size) {
        output.push(array.slice(index, index + size));
    }
    return output;
}

function pad(value, size = 3) {
    return String(value).padStart(size, '0');
}

function isoDateFromOffset(daysAgo) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - daysAgo);
    return dt.toISOString().slice(0, 10);
}

function monthDate(period, day) {
    return `${period}-${String(day).padStart(2, '0')}`;
}

function scoreValue(base, offset, max = 10) {
    return Math.max(1, Math.min(max, base + offset));
}

async function collectActors() {
    const { data, error } = await admin
        .from('employees')
        .select('employee_id,auth_email,name,department,position,role')
        .in('auth_email', ['eng.manager@demo.local', 'sales.manager@demo.local', 'director@demo.local', 'hr@demo.local']);

    if (error) throw error;

    const byEmail = new Map((data || []).map(row => [String(row.auth_email || '').toLowerCase(), row]));
    const required = ['eng.manager@demo.local', 'sales.manager@demo.local', 'director@demo.local', 'hr@demo.local'];
    required.forEach(email => {
        if (!byEmail.has(email)) {
            throw new Error(`Required seed actor missing from employees table: ${email}`);
        }
    });
    return byEmail;
}

async function fetchCompetencies() {
    const { data, error } = await admin
        .from('competency_config')
        .select('position_name,competencies');
    if (error) throw error;
    return new Map((data || []).map(row => [String(row.position_name || ''), Array.isArray(row.competencies) ? row.competencies : []]));
}

async function fetchPositionKpis(uniquePositions) {
    const { data, error } = await admin
        .from('kpi_definitions')
        .select('id,name,category,unit,target,effective_period,approval_status,is_active,description')
        .in('category', uniquePositions)
        .eq('approval_status', 'approved')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (error) throw error;

    const grouped = new Map();
    (data || []).forEach(row => {
        const key = String(row.category || '');
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    });

    uniquePositions.forEach(position => {
        if (!grouped.has(position) || grouped.get(position).length === 0) {
            throw new Error(`No approved KPI definitions found for position "${position}". Run the dummy seed first.`);
        }
    });

    return grouped;
}

async function cleanupExistingStressData() {
    const { data: assessments, error: assessmentError } = await admin
        .from('employee_assessments')
        .select('id')
        .like('employee_id', `${employeePrefix}%`);
    if (assessmentError) throw assessmentError;

    const assessmentIds = (assessments || []).map(row => row.id).filter(Boolean);
    for (const ids of chunk(assessmentIds, 100)) {
        const { error } = await admin
            .from('employee_assessment_scores')
            .delete()
            .in('assessment_id', ids);
        if (error) throw error;
    }

    const deleteByLike = async (table, column, value) => {
        const { error } = await admin.from(table).delete().like(column, value);
        if (error) throw error;
    };

    await deleteByLike('employee_assessment_history', 'employee_id', `${employeePrefix}%`);
    await deleteByLike('employee_assessments', 'employee_id', `${employeePrefix}%`);
    await deleteByLike('employee_training_records', 'employee_id', `${employeePrefix}%`);
    await deleteByLike('employee_performance_scores', 'employee_id', `${employeePrefix}%`);
    await deleteByLike('kpi_records', 'employee_id', `${employeePrefix}%`);
    await deleteByLike('employee_kpi_target_versions', 'employee_id', `${employeePrefix}%`);
    await deleteByLike('headcount_requests', 'request_code', `${requestPrefix}%`);
    await deleteByLike('manpower_plans', 'notes', `${planNotePrefix}%`);
    await deleteByLike('employees', 'employee_id', `${employeePrefix}%`);
}

async function ensureAuthUsers() {
    const users = [
        { email: stressEmployeeEmail, password: stressEmployeePassword },
        { email: stressEmployeeDoneEmail, password: stressEmployeePassword },
    ];

    for (const user of users) {
        const { error } = await admin.auth.admin.createUser({
            email: user.email,
            password: user.password,
            email_confirm: true,
            user_metadata: {
                source: 'qa-stress-seed',
                profile: profileName,
            },
        });

        if (error && !/already registered|already exists|duplicate/i.test(String(error.message || ''))) {
            throw error;
        }
    }
}

function buildEmployees(actorByEmail) {
    const rows = [];
    for (let index = 0; index < employeeCount; index += 1) {
        const positionMeta = positions[index % positions.length];
        const actor = actorByEmail.get(positionMeta.managerEmail);
        const code = pad(index + 1);
        const employeeId = `${employeePrefix}${code}`;
        const first = firstNames[index % firstNames.length];
        const last = lastNames[(index * 3) % lastNames.length];
        const email = index === 0
            ? stressEmployeeEmail
            : index === 1
                ? stressEmployeeDoneEmail
                : `qa.stress.${profileName}.${code.toLowerCase()}@demo.local`;
        rows.push({
            employee_id: employeeId,
            name: `${first} ${last} ${profile.key}${code}`,
            position: positionMeta.position,
            seniority: positionMeta.seniority,
            join_date: isoDateFromOffset(35 + (index % 540)),
            department: positionMeta.department,
            manager_id: actor.employee_id,
            auth_email: email.toLowerCase(),
            role: 'employee',
            kpi_targets: {},
            must_change_password: false,
        });
    }
    return rows;
}

function buildManpowerPlans(employeeRows, hrActor) {
    const grouped = new Map();
    employeeRows.forEach(row => {
        const key = `${row.department}::${row.position}::${row.seniority}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    });

    return [...grouped.entries()]
        .slice(0, profile.planCount)
        .map(([key, rows], index) => {
            const [department, position, seniority] = key.split('::');
            const planned = rows.length + 1 + (index % 3);
            const approved = Math.max(rows.length, planned - (index % 2));
            return {
                period: '2026-04',
                department,
                position,
                seniority,
                planned_headcount: planned,
                approved_headcount: approved,
                status: index % 4 === 0 ? 'submitted' : 'approved',
                notes: `${planNotePrefix} ${department} ${position} baseline coverage`,
                created_by: hrActor.employee_id,
                updated_by: hrActor.employee_id,
            };
        });
}

function buildHeadcountRequests(plans, managers, hrActor) {
    const statuses = ['pending', 'approved', 'approved', 'approved', 'rejected', 'cancelled'];
    const requests = [];
    for (let index = 0; index < profile.requestCount; index += 1) {
        const plan = plans[index % plans.length];
        const manager = managers.find(item => item.department === plan.department) || hrActor;
        const status = statuses[index % statuses.length];
        requests.push({
            request_code: `${requestPrefix}${pad(index + 1)}`,
            plan_id: plan.id,
            department: plan.department,
            position: plan.position,
            seniority: plan.seniority,
            requested_count: 1 + (index % 3),
            business_reason: `${planNotePrefix} ${status} request for ${plan.position} capacity and delivery coverage.`,
            priority: ['normal', 'high', 'urgent'][index % 3],
            requested_by: manager.employee_id,
            approved_by: status === 'approved' || status === 'rejected' ? hrActor.employee_id : null,
            approval_status: status,
            approval_note: status === 'approved'
                ? 'Approved during QA stress seeding.'
                : status === 'rejected'
                    ? 'Rejected during QA stress seeding.'
                    : '',
            target_hire_date: isoDateFromOffset(-14 + (index % 30)).slice(0, 10),
        });
    }
    return requests;
}

function buildRecruitmentCards(requestRows, managers) {
    const approvedRequests = requestRows.filter(row => row.approval_status === 'approved');
    const stages = ['requested', 'sourcing', 'screening', 'interview', 'offer', 'hired', 'closed'];
    const cards = [];
    for (let index = 0; index < profile.recruitmentCount; index += 1) {
        const request = approvedRequests[index % approvedRequests.length];
        const owner = managers.find(item => item.department === request.department) || managers[0];
        cards.push({
            request_id: request.id,
            candidate_name: `${candidatePrefix} Candidate ${pad(index + 1)}`,
            stage: stages[index % stages.length],
            source: ['LinkedIn', 'Referral', 'Job Board', 'Agency'][index % 4],
            owner_id: owner.employee_id,
            stage_updated_at: new Date(Date.now() - ((index % 21) * 86400000)).toISOString(),
            offer_status: index % 7 === 4 ? 'pending' : index % 7 === 5 ? 'accepted' : '',
            expected_start_date: index % 7 === 5 ? isoDateFromOffset(-(7 + (index % 14))) : null,
            notes: `${planNotePrefix} recruitment card ${index + 1}`,
        });
    }
    return cards;
}

function buildAssessments(employeeRows, competenciesByPosition, actorByEmail) {
    const managerAssessments = [];
    const selfAssessments = [];
    const assessmentScores = [];
    const historyRows = [];

    const managerLimit = Math.max(1, Math.round(employeeRows.length * profile.managerAssessmentRatio));
    const selfLimit = Math.max(1, Math.round(employeeRows.length * profile.selfAssessmentRatio));

    employeeRows.forEach((employee, index) => {
        if (index >= managerLimit) return;

        const assessmentId = crypto.randomUUID();
        const managerAssessedAt = new Date(Date.now() - ((index % 28) * 86400000)).toISOString();
        const competencies = (competenciesByPosition.get(employee.position) || [])
            .map(item => String(item?.name || '').trim())
            .filter(Boolean)
            .slice(0, 3);
        const usedCompetencies = competencies.length > 0 ? competencies : ['Role Mastery', 'Collaboration', 'Delivery'];
        const managerActor = actorByEmail.get(
            employee.department === 'IT' ? 'eng.manager@demo.local'
                : employee.department === 'Sales' ? 'sales.manager@demo.local'
                    : employee.department === 'HR' ? 'hr@demo.local'
                        : 'director@demo.local'
        );

        managerAssessments.push({
            id: assessmentId,
            employee_id: employee.employee_id,
            assessment_type: 'manager',
            percentage: 72 + (index % 20),
            seniority: employee.seniority,
            assessed_at: managerAssessedAt,
            assessed_by: managerActor.employee_id,
            source_date: managerAssessedAt.slice(0, 10),
        });
        historyRows.push({
            employee_id: employee.employee_id,
            assessment_type: 'manager',
            assessed_on: managerAssessedAt.slice(0, 10),
            percentage: 72 + (index % 20),
            seniority: employee.seniority,
            position: employee.position,
        });

        usedCompetencies.forEach((name, scoreIndex) => {
            assessmentScores.push({
                assessment_id: assessmentId,
                competency_name: name,
                score: scoreValue(7, (index + scoreIndex) % 3),
                note: `${planNotePrefix} manager review note for ${name}`,
            });
        });

        if (index === 0) return;
        if (index >= selfLimit) return;

        const selfAssessmentId = crypto.randomUUID();
        const selfAssessedAt = new Date(Date.now() - ((index % 17) * 86400000)).toISOString();
        selfAssessments.push({
            id: selfAssessmentId,
            employee_id: employee.employee_id,
            assessment_type: 'self',
            percentage: 70 + (index % 18),
            seniority: employee.seniority,
            assessed_at: selfAssessedAt,
            assessed_by: employee.employee_id,
            source_date: selfAssessedAt.slice(0, 10),
        });
        historyRows.push({
            employee_id: employee.employee_id,
            assessment_type: 'self',
            assessed_on: selfAssessedAt.slice(0, 10),
            percentage: 70 + (index % 18),
            seniority: employee.seniority,
            position: employee.position,
        });

        usedCompetencies.forEach((name, scoreIndex) => {
            assessmentScores.push({
                assessment_id: selfAssessmentId,
                competency_name: name,
                score: scoreValue(6, (index + scoreIndex) % 4),
                note: `${planNotePrefix} self review note for ${name}`,
            });
        });
    });

    return {
        managerAssessments,
        selfAssessments,
        assessmentScores,
        historyRows,
    };
}

function buildKpiTargetVersions(employeeRows, positionKpis, actorByEmail) {
    const targetVersions = [];
    employeeRows.forEach((employee, employeeIndex) => {
        const kpis = (positionKpis.get(employee.position) || []).slice(0, 2);
        kpis.forEach((kpi, kpiIndex) => {
            profile.targetPeriods.forEach((period, periodIndex) => {
                targetVersions.push({
                    employee_id: employee.employee_id,
                    kpi_id: kpi.id,
                    effective_period: period,
                    version_no: 1,
                    target_value: Number(kpi.target || 100) * (0.92 + ((employeeIndex + periodIndex + kpiIndex) % 4) * 0.07),
                    unit: kpi.unit || 'Point',
                    status: 'approved',
                    request_note: `${planNotePrefix} KPI target`,
                    requested_by: actorByEmail.get('hr@demo.local').employee_id,
                    approved_by: actorByEmail.get('hr@demo.local').employee_id,
                    approved_at: new Date().toISOString(),
                });
            });
        });
    });
    return targetVersions;
}

function buildKpiRecords(employeeRows, targetVersionMap, positionKpis) {
    const records = [];
    employeeRows.forEach((employee, employeeIndex) => {
        const kpis = (positionKpis.get(employee.position) || []).slice(0, 2);
        kpis.forEach((kpi, kpiIndex) => {
            profile.targetPeriods.forEach((period, periodIndex) => {
                const versionKey = `${employee.employee_id}::${kpi.id}::${period}`;
                const targetVersion = targetVersionMap.get(versionKey);
                const multiplier = periodIndex === 0 ? 0.84 : periodIndex === 1 ? 0.96 : 1.05;
                records.push({
                    employee_id: employee.employee_id,
                    kpi_id: kpi.id,
                    period,
                    value: Number(targetVersion.target_value || kpi.target || 100) * (multiplier + ((employeeIndex + kpiIndex) % 5) * 0.03),
                    notes: `${planNotePrefix} KPI submission`,
                    submitted_by: employeeIndex % 5 === 0 ? employee.manager_id : employee.employee_id,
                    submitted_at: monthDate(period, 20 - (employeeIndex % 5)),
                    updated_by: employee.manager_id,
                    updated_at: monthDate(period, 23 - (employeeIndex % 3)),
                    target_snapshot: Number(targetVersion.target_value || kpi.target || 100),
                    kpi_name_snapshot: kpi.name,
                    kpi_unit_snapshot: kpi.unit || 'Point',
                    kpi_category_snapshot: kpi.category || employee.position,
                    target_version_id: targetVersion.id,
                });
            });
        });
    });
    return records;
}

async function insertBatches(table, rows, { upsert = false, onConflict = '' } = {}) {
    for (const batch of chunk(rows, 200)) {
        let query = admin.from(table);
        if (upsert) {
            query = query.upsert(batch, onConflict ? { onConflict } : undefined);
        } else {
            query = query.insert(batch);
        }
        const { error } = await query;
        if (error) throw error;
    }
}

async function main() {
    console.log(`Preparing QA stress seed profile=${profileName} employees=${employeeCount}`);
    const actorByEmail = await collectActors();
    const competenciesByPosition = await fetchCompetencies();
    const uniquePositions = [...new Set(positions.map(item => item.position))];
    const positionKpis = await fetchPositionKpis(uniquePositions);

    if (hasFlag('--reset-only')) {
        await cleanupExistingStressData();
        console.log(`Removed existing ${profileName} stress data.`);
        return;
    }

    await cleanupExistingStressData();
    await ensureAuthUsers();

    const employeeRows = buildEmployees(actorByEmail);
    await insertBatches('employees', employeeRows);

    const hrActor = actorByEmail.get('hr@demo.local');
    const managerActors = [
        actorByEmail.get('eng.manager@demo.local'),
        actorByEmail.get('sales.manager@demo.local'),
        actorByEmail.get('director@demo.local'),
    ].map(item => ({
        employee_id: item.employee_id,
        department: item.department,
    }));

    const manpowerPlans = buildManpowerPlans(employeeRows, hrActor);
    await insertBatches('manpower_plans', manpowerPlans);
    const { data: insertedPlans, error: planFetchError } = await admin
        .from('manpower_plans')
        .select('id,department,position,seniority,period')
        .like('notes', `${planNotePrefix}%`);
    if (planFetchError) throw planFetchError;

    const planByKey = new Map((insertedPlans || []).map(row => [`${row.department}::${row.position}::${row.seniority}`, row]));
    const planRows = manpowerPlans.map(plan => planByKey.get(`${plan.department}::${plan.position}::${plan.seniority}`)).filter(Boolean);

    const requests = buildHeadcountRequests(planRows, managerActors, hrActor);
    await insertBatches('headcount_requests', requests);
    const { data: insertedRequests, error: requestFetchError } = await admin
        .from('headcount_requests')
        .select('id,request_code,department,position,approval_status,requested_count,target_hire_date')
        .like('request_code', `${requestPrefix}%`);
    if (requestFetchError) throw requestFetchError;

    const requestRows = requests.map(request => (
        insertedRequests.find(row => row.request_code === request.request_code)
    )).filter(Boolean);
    const recruitmentCards = buildRecruitmentCards(requestRows, managerActors);
    await insertBatches('recruitment_pipeline', recruitmentCards);

    const assessments = buildAssessments(employeeRows, competenciesByPosition, actorByEmail);
    await insertBatches('employee_assessments', assessments.managerAssessments.concat(assessments.selfAssessments));
    await insertBatches('employee_assessment_scores', assessments.assessmentScores);
    await insertBatches('employee_assessment_history', assessments.historyRows, {
        upsert: true,
        onConflict: 'employee_id,assessment_type,assessed_on,percentage,seniority,position',
    });

    const targetVersions = buildKpiTargetVersions(employeeRows, positionKpis, actorByEmail);
    await insertBatches('employee_kpi_target_versions', targetVersions, {
        upsert: true,
        onConflict: 'employee_id,kpi_id,effective_period,version_no',
    });

    const { data: insertedTargetVersions, error: targetFetchError } = await admin
        .from('employee_kpi_target_versions')
        .select('id,employee_id,kpi_id,effective_period,target_value')
        .like('employee_id', `${employeePrefix}%`)
        .eq('version_no', 1);
    if (targetFetchError) throw targetFetchError;

    const targetVersionMap = new Map((insertedTargetVersions || []).map(row => [
        `${row.employee_id}::${row.kpi_id}::${row.effective_period}`,
        row,
    ]));

    const kpiRecords = buildKpiRecords(employeeRows, targetVersionMap, positionKpis);
    await insertBatches('kpi_records', kpiRecords);

    console.log(`QA stress seed ready:
- employees: ${employeeRows.length}
- manpower plans: ${planRows.length}
- headcount requests: ${requestRows.length}
- recruitment cards: ${recruitmentCards.length}
- manager assessments: ${assessments.managerAssessments.length}
- self assessments: ${assessments.selfAssessments.length}
- KPI target versions: ${targetVersions.length}
- KPI records: ${kpiRecords.length}
- stress employee login: ${stressEmployeeEmail} / ${stressEmployeePassword}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
