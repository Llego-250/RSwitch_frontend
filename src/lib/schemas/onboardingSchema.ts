import { z } from "zod";

export const step1InstitutionSchema = z.object({
  institutionName: z.string().min(3, "Institution name must be at least 3 characters"),
  licenseNumber: z.string().min(5, "Valid BNR license number required (e.g. BNR-LIC-2024-88)"),
  institutionType: z.enum(["Commercial Bank", "Microfinance Institution", "E-Money Issuer", "SACCO", "Payment Service Provider"]),
  swiftBic: z.string().min(8, "SWIFT/BIC code must be 8 or 11 characters").max(11),
  primaryContactName: z.string().min(2, "Contact name required"),
  primaryContactEmail: z.string().email("Valid work email required"),
  primaryContactPhone: z.string().min(10, "Phone number must be at least 10 digits"),
});

export const step2TechnicalSchema = z.object({
  apiBaseUrl: z.string().url("Must be a valid HTTPS API endpoint URL (e.g. https://api.bank.rw/v1)"),
  webhookCallbackUrl: z.string().url("Must be a valid HTTPS webhook URL"),
  environment: z.enum(["Staging", "Production", "Sandbox"]),
  authType: z.enum(["OAuth2 Client Credentials", "mTLS Certificate", "API Key Header"]),
  ipWhitelist: z.string().min(7, "Enter valid IP or CIDR block (e.g. 197.243.12.0/24)"),
  publicKeyPem: z.string().min(20, "Paste public key certificate (PEM format)"),
});

export const step3ComplianceSchema = z.object({
  dataPrivacyOfficerName: z.string().min(3, "Data Privacy Officer name required"),
  dataPrivacyOfficerEmail: z.string().email("Valid DPO email required"),
  amlComplianceApproved: z.boolean().refine((val) => val === true, "Must confirm AML/CFT regulatory compliance"),
  kycAuditSignedDate: z.string().min(1, "KYC Audit sign-off date required"),
  licenseDocumentName: z.string().min(1, "BNR License document attachment required"),
});

export interface FieldMappingRule {
  targetField: string;
  sourceField: string;
  dataType: string;
  isRequired: boolean;
}

export const defaultFieldMappings: FieldMappingRule[] = [
  { targetField: "participant_id", sourceField: "inst_code", dataType: "String (UUID)", isRequired: true },
  { targetField: "institution_name", sourceField: "bank_name", dataType: "String", isRequired: true },
  { targetField: "swift_bic", sourceField: "bic_code", dataType: "String", isRequired: true },
  { targetField: "transaction_volume", sourceField: "daily_tx_vol", dataType: "Numeric", isRequired: false },
  { targetField: "settlement_account", sourceField: "nrb_acct_num", dataType: "String", isRequired: true },
  { targetField: "compliance_score", sourceField: "risk_rating", dataType: "Decimal", isRequired: false },
];

export const onboardingFullSchema = z.object({
  institution: step1InstitutionSchema,
  technical: step2TechnicalSchema,
  compliance: step3ComplianceSchema,
});

export type Step1Data = z.infer<typeof step1InstitutionSchema>;
export type Step2Data = z.infer<typeof step2TechnicalSchema>;
export type Step3Data = z.infer<typeof step3ComplianceSchema>;
