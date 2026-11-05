/**
 * IndustrialStyle — the ontology for industrial software engineering.
 *
 * Aligned with the normative stack used in factory automation, process control,
 * power utility automation, and OT cybersecurity. Designed to be sold into
 * regulated integrators (Schneider Electric, Siemens, Rockwell, ABB, Honeywell)
 * and their end customers (pharma, oil & gas, automotive, power, water).
 *
 * Standards lineage:
 *   IEC 61508        Functional safety of E/E/PE systems         (SIL 1-4)
 *   IEC 61511        Functional safety, process industry sector
 *   IEC 62443        Industrial automation and control security  (SL 1-4, Zones/Conduits)
 *   IEC 61131-3      PLC programming languages                    (ST, LD, FBD, SFC, IL)
 *   IEC 61850        Power utility automation
 *   ISA-88           Batch control (recipe + equipment hierarchy)
 *   ISA-95           Enterprise–control integration (Purdue model)
 *   ISA-18.2         Management of alarm systems
 *   ISO 13849        Safety of machinery (Performance Level a-e)
 *   IEC 62061        Safety of machinery (SIL for machinery)
 *   IEC 60204-1      Electrical equipment of machines
 *   ISO 22400        KPIs for manufacturing
 *   IEC 61131-9      IO-Link
 *   NAMUR NE series  Process industry recommendations
 *   21 CFR Part 11   FDA electronic records (pharma / food)
 *   GAMP 5           GxP validation (life sciences)
 *
 * Use this Style when the deliverable must survive:
 *   - a HAZOP / LOPA / FMEA review
 *   - a Factory Acceptance Test (FAT) and a Site Acceptance Test (SAT)
 *   - an IEC 62443 cybersecurity audit
 *   - a regulatory inspection (ATEX, UL, CE, IECEx, FDA)
 */

import type {
  RequirementStyle,
  StyleVocabulary,
  StyleValidators,
  StyleTemplates,
  RequirementReporter,
  ValidationResult,
  RequirementTemplate,
} from '@frenchexdev2/requirements-core';

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const INDUSTRIAL_VOCABULARY: StyleVocabulary = {
  requirementKinds: [
    'Functional',           // the process / control behaviour itself
    'Safety',               // IEC 61508 / 61511 / 13849 / 62061 — SIS, interlocks, trips
    'Security',             // IEC 62443 — zones, conduits, SL targets
    'Availability',         // uptime, redundancy, failover (ISO 22400 APQ)
    'Performance',          // cycle time, throughput, latency (ISO 22400 OEE/TEEP)
    'Interoperability',     // IEC 61850, OPC UA, ISA-95, IEC 61131-3
    'Maintainability',      // remote access, spare parts, MTBF/MTTR
    'Regulatory',           // CE, UL, ATEX, IECEx, 21 CFR Part 11, GAMP 5
    'Environmental',        // ingress protection, temperature, vibration, EMC
    'Traceability',         // batch genealogy (ISA-88), audit trail (21 CFR 11)
  ],

  // Heavy-gate lifecycle — every transition is auditable. Typical for SIS/DCS projects.
  statusWorkflow: {
    states: [
      'Draft',
      'UnderInternalReview',
      'TechnicalApproval',
      'SafetyApproval',          // IEC 61508 functional-safety sign-off
      'SecurityApproval',        // IEC 62443 CSMS sign-off
      'CustomerApproval',        // URS/FRS/FDS agreed
      'Implemented',
      'FactoryTested',           // FAT passed
      'SiteTested',              // SAT passed
      'Commissioned',            // in operation, conditionally accepted
      'InProduction',            // post warranty / fully accepted
      'UnderChange',             // MoC — Management of Change raised
      'Deprecated',
    ],
    initial: 'Draft',
    transitions: [
      { from: 'Draft',                to: 'UnderInternalReview' },
      { from: 'UnderInternalReview',  to: 'TechnicalApproval' },
      { from: 'TechnicalApproval',    to: 'SafetyApproval' },
      { from: 'SafetyApproval',       to: 'SecurityApproval' },
      { from: 'SecurityApproval',     to: 'CustomerApproval' },
      { from: 'CustomerApproval',     to: 'Implemented' },
      { from: 'Implemented',          to: 'FactoryTested' },
      { from: 'FactoryTested',        to: 'SiteTested' },
      { from: 'SiteTested',           to: 'Commissioned' },
      { from: 'Commissioned',         to: 'InProduction' },
      { from: 'InProduction',         to: 'UnderChange' },
      { from: 'UnderChange',          to: 'Implemented' },
      { from: 'InProduction',         to: 'Deprecated' },
      // Rework loops
      { from: 'TechnicalApproval',    to: 'Draft' },
      { from: 'SafetyApproval',       to: 'Draft' },
      { from: 'SecurityApproval',     to: 'Draft' },
      { from: 'CustomerApproval',     to: 'Draft' },
    ],
    terminal: ['Deprecated'],
  },

  // Risk = SIL (IEC 61508). Non-safety requirements carry NonSIL.
  riskTaxonomy: {
    levels: ['SIL4', 'SIL3', 'SIL2', 'SIL1', 'NonSIL'],
    // Likelihood × Severity risk matrix, IEC 61508-5 style (illustrative — customise per HAZOP)
    matrix: {
      axes: {
        likelihood: ['Frequent', 'Probable', 'Occasional', 'Remote', 'Improbable'],
        impact:     ['Catastrophic', 'Critical', 'Marginal', 'Negligible'],
      },
      cells: [
        { likelihood: 'Frequent',   impact: 'Catastrophic', level: 'SIL4' },
        { likelihood: 'Frequent',   impact: 'Critical',     level: 'SIL3' },
        { likelihood: 'Probable',   impact: 'Catastrophic', level: 'SIL3' },
        { likelihood: 'Probable',   impact: 'Critical',     level: 'SIL2' },
        { likelihood: 'Occasional', impact: 'Catastrophic', level: 'SIL2' },
        { likelihood: 'Occasional', impact: 'Critical',     level: 'SIL1' },
        { likelihood: 'Remote',     impact: 'Catastrophic', level: 'SIL1' },
        { likelihood: 'Improbable', impact: 'Catastrophic', level: 'NonSIL' },
        // Lower quadrants → NonSIL (designers mitigate via good-practice, not SIS)
      ],
    },
  },

  // Verification methods used in industrial projects. Each implies specific artefacts.
  verificationMethods: [
    'UnitTest',                // IEC 61131-3 function block / ST test
    'IntegrationTest',         // controller + IO in simulator
    'HIL',                     // Hardware-in-the-Loop
    'FAT',                     // Factory Acceptance Test (at integrator site)
    'SAT',                     // Site Acceptance Test (at customer site)
    'SILProofTest',            // periodic SIS proof test per IEC 61511
    'SILValidation',           // IEC 61508 route validation
    'SecurityAssessment',      // IEC 62443 SL verification
    'PenetrationTest',         // OT pentest within 62443 scope
    'Simulation',              // process simulator (e.g. UniSim, DYNSIM)
    'Audit',                   // regulatory / internal
    'Certification',           // CE / UL / ATEX / IECEx / TÜV
    'RegressionTest',          // post-MoC (Management of Change)
  ],

  rationaleKinds: [
    'hazard-analysis',            // HAZOP / LOPA / FMEA outcome
    'regulatory-compliance',      // mandated by law / sector rule
    'customer-requirement',       // URS / FRS / contract
    'cybersecurity-risk',         // 62443 threat model output
    'availability-target',        // SLA / uptime
    'interoperability-standard',  // bus protocol conformance
    'environmental-constraint',   // ingress / EMC / thermal
    'batch-recipe-rule',          // ISA-88 constraint
    'alarm-rationalisation',      // ISA-18.2 outcome
    'best-practice',              // NAMUR / vendor recommendation
  ],

  sourceKinds: [
    { kind: 'iec-standard', label: 'IEC standard', slots: [
      { name: 'id',      type: 'string', required: true,  hint: '61508-1, 61511-1, 62443-3-3, …' },
      { name: 'section', type: 'string', required: false, hint: 'clause / table / annex' },
      { name: 'edition', type: 'string', required: false },
    ]},
    { kind: 'iso-standard', label: 'ISO standard', slots: [
      { name: 'id',      type: 'string', required: true,  hint: '13849-1, 22400-2, …' },
      { name: 'section', type: 'string', required: false },
    ]},
    { kind: 'isa-standard', label: 'ISA standard', slots: [
      { name: 'id', type: 'string', required: true, hint: '88.01, 95.00.01, 18.2, …' },
    ]},
    { kind: 'regulation', label: 'Regulation / directive', slots: [
      { name: 'jurisdiction', type: 'string', required: true,  hint: 'EU, FR, US-FDA, …' },
      { name: 'act',          type: 'string', required: true,  hint: 'Machinery Directive, ATEX, 21 CFR 11, …' },
      { name: 'article',      type: 'string', required: false },
    ]},
    { kind: 'customer-urs', label: 'User Requirement Specification (customer)', slots: [
      { name: 'docId',   type: 'string', required: true },
      { name: 'section', type: 'string', required: false },
      { name: 'revision', type: 'string', required: false },
    ]},
    { kind: 'hazop', label: 'HAZOP finding', slots: [
      { name: 'study',    type: 'string',   required: true },
      { name: 'node',     type: 'string',   required: true },
      { name: 'deviation', type: 'string',  required: true },
      { name: 'date',     type: 'iso-date', required: true },
    ]},
    { kind: 'lopa', label: 'LOPA analysis', slots: [
      { name: 'study',    type: 'string',   required: true },
      { name: 'scenario', type: 'string',   required: true },
      { name: 'iplCount', type: 'number',   required: false, hint: 'Independent Protection Layers' },
    ]},
    { kind: 'fmea', label: 'FMEA / FMECA', slots: [
      { name: 'study',        type: 'string', required: true },
      { name: 'failureMode',  type: 'string', required: true },
      { name: 'rpnBefore',    type: 'number', required: false, hint: 'Risk Priority Number' },
    ]},
    { kind: 'cybersecurity-threat', label: 'IEC 62443 threat model', slots: [
      { name: 'zone',      type: 'string', required: true },
      { name: 'threatId',  type: 'string', required: true },
      { name: 'slTarget',  type: 'string', required: true, hint: 'SL 1-4' },
    ]},
    { kind: 'incident', label: 'Incident / near-miss', slots: [
      { name: 'incidentId', type: 'string',   required: true },
      { name: 'date',       type: 'iso-date', required: true },
      { name: 'reportUrl',  type: 'url',      required: false },
    ]},
    { kind: 'vendor-recommendation', label: 'Vendor recommendation (NAMUR / OEM)', slots: [
      { name: 'vendor',    type: 'string', required: true },
      { name: 'documentId', type: 'string', required: true },
    ]},
  ],

  // Statement patterns: EARS (familiar to industrial RE) + safety-function + interlock + alarm.
  statementPatterns: [
    { pattern: 'ubiquitous',   label: 'EARS Ubiquitous',   template: 'The system shall {response}.',
      slots: [ { name: 'response', required: true } ] },
    { pattern: 'event-driven', label: 'EARS Event-driven', template: 'When {trigger}, the system shall {response}.',
      slots: [ { name: 'trigger', required: true }, { name: 'response', required: true } ] },
    { pattern: 'state-driven', label: 'EARS State-driven', template: 'While {state}, the system shall {response}.',
      slots: [ { name: 'state', required: true }, { name: 'response', required: true } ] },
    { pattern: 'optional',     label: 'EARS Optional',     template: 'Where {feature}, the system shall {response}.',
      slots: [ { name: 'feature', required: true }, { name: 'response', required: true } ] },
    { pattern: 'unwanted',     label: 'EARS Unwanted',     template: 'If {trigger}, then the system shall {response}.',
      slots: [ { name: 'trigger', required: true }, { name: 'response', required: true } ] },

    // Safety function — IEC 61511 form. Every SIF fits this template.
    { pattern: 'safety-function',
      label: 'IEC 61511 Safety Instrumented Function (SIF)',
      template: 'The safety function shall {action} upon {demand} within {responseTime}, achieving {silLevel} with proof-test interval {proofInterval}.',
      slots: [
        { name: 'action',         required: true, hint: 'e.g. close valve XV-101, trip motor M-204' },
        { name: 'demand',         required: true, hint: 'the initiating event / process deviation' },
        { name: 'responseTime',   required: true, hint: 'e.g. 2 s, 100 ms' },
        { name: 'silLevel',       required: true, hint: 'SIL 1-4' },
        { name: 'proofInterval',  required: true, hint: 'e.g. 1 year, 6 months' },
      ] },

    // Interlock — non-SIL protective function (ISA / NFPA style)
    { pattern: 'interlock',
      label: 'Process interlock (non-SIL)',
      template: 'Interlock {id}: when {condition}, the system shall {action}; bypass {bypassRule}.',
      slots: [
        { name: 'id',         required: true, hint: 'e.g. IL-42' },
        { name: 'condition',  required: true },
        { name: 'action',     required: true },
        { name: 'bypassRule', required: true, hint: 'key-switched / supervised / none' },
      ] },

    // Alarm — ISA-18.2
    { pattern: 'alarm',
      label: 'Alarm requirement (ISA-18.2)',
      template: 'Alarm {tag} at {priority} shall annunciate when {condition}, with consequence {consequence} and required operator action {action} within {responseTime}.',
      slots: [
        { name: 'tag',          required: true, hint: 'e.g. PAH-101' },
        { name: 'priority',     required: true, hint: 'Journal / Low / High / Critical (emergency)' },
        { name: 'condition',    required: true },
        { name: 'consequence',  required: true },
        { name: 'action',       required: true },
        { name: 'responseTime', required: true },
      ] },

    // Cybersecurity zone requirement — IEC 62443-3-3
    { pattern: 'security-zone',
      label: 'IEC 62443 security requirement',
      template: 'Zone {zone} (SL-T {slTarget}) shall enforce {requirement} via conduit {conduit} with countermeasure {countermeasure}.',
      slots: [
        { name: 'zone',          required: true, hint: 'e.g. Level 2 Supervision' },
        { name: 'slTarget',      required: true, hint: 'SL 1-4 vector e.g. (2,2,2,1,2,1,2)' },
        { name: 'requirement',   required: true, hint: 'SR / RE from 62443-3-3' },
        { name: 'conduit',       required: true },
        { name: 'countermeasure', required: true },
      ] },

    // Natural fallback — discouraged but available for brownfield migration
    { pattern: 'natural', label: 'Natural language (brownfield fallback — generates warning)',
      template: '{text}', slots: [ { name: 'text', required: true } ] },
  ],
};

// ── Validators ──────────────────────────────────────────────────────────────

function ok(): ValidationResult { return { ok: true, errors: [] }; }

export const INDUSTRIAL_VALIDATORS: StyleValidators = {
  validateStatement(statement: unknown): ValidationResult {
    if (!statement || typeof statement !== 'object') return { ok: false, errors: [{ path: 'statement', message: 'must be an object' }] };
    const s = statement as Record<string, unknown>;
    const schema = INDUSTRIAL_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return { ok: false, errors: [{ path: 'statement.pattern', message: `unknown pattern '${String(s.pattern)}'` }] };
    const errors = schema.slots
      .filter(slot => slot.required && (typeof s[slot.name] !== 'string' || (s[slot.name] as string).length === 0))
      .map(slot => ({ path: `statement.${slot.name}`, message: `required slot missing for pattern '${schema.pattern}'` }));
    return errors.length === 0 ? ok() : { ok: false, errors };
  },

  validateSpec(spec: unknown): ValidationResult {
    if (!spec || typeof spec !== 'object') return { ok: false, errors: [{ path: '', message: 'spec must be an object' }] };
    const s = spec as Record<string, unknown>;
    const errors: { path: string; message: string }[] = [];

    if (s.kind === 'requirement') {
      if (!INDUSTRIAL_VOCABULARY.requirementKinds.includes(s.requirementKind as string)) {
        errors.push({ path: 'requirementKind', message: `expected one of ${INDUSTRIAL_VOCABULARY.requirementKinds.join(', ')}` });
      }
      if (!INDUSTRIAL_VOCABULARY.statusWorkflow.states.includes(s.status as string)) {
        errors.push({ path: 'status', message: 'status must be an IndustrialStyle state' });
      }

      // SAFETY RULE: if kind == Safety, risk.level must be SIL1-4 (never NonSIL)
      if (s.requirementKind === 'Safety') {
        const risk = s.risk as Record<string, unknown> | undefined;
        const level = risk?.level as string | undefined;
        if (!level || !['SIL1', 'SIL2', 'SIL3', 'SIL4'].includes(level)) {
          errors.push({ path: 'risk.level', message: 'Safety requirements must carry SIL1-4 per IEC 61508 (got ' + String(level) + ')' });
        }
      }

      // SAFETY RULE: if statement.pattern == safety-function, verificationMethod must include SILProofTest or SILValidation
      const statement = s.statement as Record<string, unknown> | undefined;
      if (statement?.pattern === 'safety-function') {
        const vm = s.verificationMethod as string | undefined;
        if (!vm || !['SILProofTest', 'SILValidation', 'Certification'].includes(vm)) {
          errors.push({ path: 'verificationMethod', message: 'safety-function statements require SILProofTest, SILValidation, or Certification' });
        }
      }

      // COMPLIANCE RULE: Regulatory requirements must cite an iec/iso/isa/regulation source
      if (s.requirementKind === 'Regulatory') {
        const source = s.source as Record<string, unknown> | undefined;
        const t = source?.type as string | undefined;
        if (!t || !['iec-standard', 'iso-standard', 'isa-standard', 'regulation'].includes(t)) {
          errors.push({ path: 'source.type', message: 'Regulatory requirements must cite a standard or regulation source' });
        }
      }

      const stmt = this.validateStatement(s.statement);
      if (!stmt.ok) errors.push(...stmt.errors);
    }

    return errors.length === 0 ? ok() : { ok: false, errors };
  },
};

// ── Templates — ready-to-instantiate skeletons for common industrial requirement types ──

const INDUSTRIAL_TEMPLATE_LIST: readonly RequirementTemplate[] = [
  {
    id: 'sif-iec61511',
    label: 'Safety Instrumented Function (IEC 61511)',
    description: 'A SIL-rated safety function: valve trip, motor stop, burner shutdown, ESD.',
    skeleton: {
      kind: 'Safety',
      statementPattern: 'safety-function',
      priority: 'Critical',
      defaultFitCriterionKinds: ['inspection', 'demonstration'],  // SIL proof test, FAT, SAT
      rationaleKind: 'hazard-analysis',
      verificationMethod: 'SILProofTest',
    },
  },
  {
    id: 'process-interlock',
    label: 'Process interlock (non-SIL protection)',
    description: 'A protective function sized below the SIL threshold — good-practice safeguard.',
    skeleton: {
      kind: 'Safety',
      statementPattern: 'interlock',
      priority: 'High',
      defaultFitCriterionKinds: ['inspection'],
      rationaleKind: 'best-practice',
      verificationMethod: 'FAT',
    },
  },
  {
    id: 'alarm-isa182',
    label: 'Alarm requirement (ISA-18.2)',
    description: 'Operator-actionable alarm with rationalisation record.',
    skeleton: {
      kind: 'Functional',
      statementPattern: 'alarm',
      priority: 'High',
      defaultFitCriterionKinds: ['inspection'],
      rationaleKind: 'alarm-rationalisation',
      verificationMethod: 'FAT',
    },
  },
  {
    id: 'cyber-zone-62443',
    label: 'IEC 62443 zone / conduit requirement',
    description: 'Security Level target for a zone + enforcement via a conduit countermeasure.',
    skeleton: {
      kind: 'Security',
      statementPattern: 'security-zone',
      priority: 'Critical',
      defaultFitCriterionKinds: ['inspection', 'quality-gate'],
      rationaleKind: 'cybersecurity-risk',
      verificationMethod: 'SecurityAssessment',
    },
  },
  {
    id: 'batch-recipe-isa88',
    label: 'ISA-88 batch recipe phase',
    description: 'A recipe phase with equipment binding, parameters, and completion criteria.',
    skeleton: {
      kind: 'Functional',
      statementPattern: 'state-driven',
      priority: 'High',
      defaultFitCriterionKinds: ['unit-test', 'demonstration'],
      rationaleKind: 'batch-recipe-rule',
      verificationMethod: 'IntegrationTest',
    },
  },
  {
    id: 'availability-sla',
    label: 'Availability / uptime target',
    description: 'Uptime SLA with measurement window and degraded-mode behaviour.',
    skeleton: {
      kind: 'Availability',
      statementPattern: 'state-driven',
      priority: 'High',
      defaultFitCriterionKinds: ['metric'],
      rationaleKind: 'availability-target',
      verificationMethod: 'Audit',
    },
  },
  {
    id: 'regulatory-ce-atex',
    label: 'Regulatory compliance (CE / ATEX / IECEx / UL)',
    description: 'Certification-driven requirement with mandatory verification by accredited body.',
    skeleton: {
      kind: 'Regulatory',
      statementPattern: 'ubiquitous',
      priority: 'Critical',
      defaultFitCriterionKinds: ['inspection'],
      rationaleKind: 'regulatory-compliance',
      verificationMethod: 'Certification',
    },
  },
  {
    id: 'gxp-21cfr11',
    label: '21 CFR Part 11 electronic records (pharma / food)',
    description: 'Tamper-evident audit trail, electronic signature, access control.',
    skeleton: {
      kind: 'Regulatory',
      statementPattern: 'ubiquitous',
      priority: 'Critical',
      defaultFitCriterionKinds: ['inspection', 'quality-gate'],
      rationaleKind: 'regulatory-compliance',
      verificationMethod: 'Audit',
    },
  },
  {
    id: 'interoperability-opcua',
    label: 'OPC UA / IEC 61850 interoperability',
    description: 'Protocol conformance + information-model binding.',
    skeleton: {
      kind: 'Interoperability',
      statementPattern: 'ubiquitous',
      priority: 'Medium',
      defaultFitCriterionKinds: ['unit-test', 'demonstration'],
      rationaleKind: 'interoperability-standard',
      verificationMethod: 'IntegrationTest',
    },
  },
];

export const INDUSTRIAL_TEMPLATES: StyleTemplates = {
  templates: INDUSTRIAL_TEMPLATE_LIST,
  findTemplate(id: string) {
    return INDUSTRIAL_TEMPLATE_LIST.find(t => t.id === id);
  },
};

// ── Reporter — FAT/SAT-ready Markdown output ────────────────────────────────

export const INDUSTRIAL_REPORTER: RequirementReporter = {
  renderStatement(statement: unknown): string {
    if (!statement || typeof statement !== 'object') return '';
    const s = statement as Record<string, string>;
    const schema = INDUSTRIAL_VOCABULARY.statementPatterns.find(p => p.pattern === s.pattern);
    if (!schema) return JSON.stringify(statement);
    let out = schema.template;
    for (const slot of schema.slots) out = out.replace(`{${slot.name}}`, s[slot.name] ?? '…');
    return out;
  },

  renderRequirement(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`${s.id}  ${s.title}`);
    lines.push(`  Kind: ${s.requirementKind}    Status: ${s.status}    Priority: ${s.priority}`);
    const risk = s.risk as Record<string, unknown> | undefined;
    if (risk?.level) lines.push(`  Risk/SIL: ${String(risk.level)}    ifNotMet: ${String(risk.ifNotMet)}`);
    lines.push(`  VerificationMethod: ${s.verificationMethod}`);
    lines.push(`  Statement: ${this.renderStatement(s.statement)}`);
    return lines.join('\n');
  },

  renderMarkdown(spec: unknown): string {
    if (!spec || typeof spec !== 'object') return '';
    const s = spec as Record<string, unknown>;
    const risk = s.risk as Record<string, unknown> | undefined;
    const source = s.source as Record<string, unknown> | undefined;
    const lines: string[] = [];
    lines.push(`# ${s.id} — ${s.title}`);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|---|---|');
    lines.push(`| Kind | ${s.requirementKind} |`);
    lines.push(`| SIL / Risk | ${risk?.level ?? 'NonSIL'} |`);
    lines.push(`| Priority | ${s.priority} |`);
    lines.push(`| Status | ${s.status} |`);
    lines.push(`| Verification method | ${s.verificationMethod} |`);
    lines.push(`| Source | ${source?.type ?? '—'} (${Object.entries(source ?? {}).filter(([k]) => k !== 'type').map(([k,v]) => `${k}=${String(v)}`).join(', ')}) |`);
    lines.push('');
    lines.push('## Statement');
    lines.push('');
    lines.push(`> ${this.renderStatement(s.statement)}`);
    lines.push('');
    lines.push(`**If not met**: ${String(risk?.ifNotMet ?? '—')}`);
    return lines.join('\n');
  },
};

// ── The Industrial Style ────────────────────────────────────────────────────

export const IndustrialStyle: RequirementStyle = {
  id: '@frenchexdev2/requirements/styles/industrial',
  version: '1.0.0',
  vocabulary: INDUSTRIAL_VOCABULARY,
  validators: INDUSTRIAL_VALIDATORS,
  templates: INDUSTRIAL_TEMPLATES,
  reporter: INDUSTRIAL_REPORTER,
  fitCriterionAdapters: [],
};

export type IndustrialStyleType = typeof IndustrialStyle;
