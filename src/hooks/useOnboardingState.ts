import { useState, useEffect } from "react";
import {
  Step1Data,
  Step2Data,
  Step3Data,
  FieldMappingRule,
  defaultFieldMappings,
} from "@/lib/schemas/onboardingSchema";

export type OnboardingStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export interface OnboardingState {
  currentStep: number;
  status: OnboardingStatus;
  lastSavedAt: string | null;
  step1: Partial<Step1Data>;
  step2: Partial<Step2Data>;
  step3: Partial<Step3Data>;
  fieldMappings: FieldMappingRule[];
}

const STORAGE_KEY = "rdip_onboarding_draft_v1";

const initialFormState: OnboardingState = {
  currentStep: 1,
  status: "DRAFT",
  lastSavedAt: null,
  step1: {
    institutionName: "Kigali Community Bank",
    licenseNumber: "BNR-LIC-2025-092",
    institutionType: "Commercial Bank",
    swiftBic: "KIGBRW22",
    primaryContactName: "Jean De Dieu Hakizimana",
    primaryContactEmail: "j.hakizimana@kigali-bank.rw",
    primaryContactPhone: "+250788123456",
  },
  step2: {
    apiBaseUrl: "https://api.kigali-bank.rw/v1/rdip",
    webhookCallbackUrl: "https://api.kigali-bank.rw/v1/webhooks/rswitch",
    environment: "Staging",
    authType: "OAuth2 Client Credentials",
    ipWhitelist: "197.243.12.0/24",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz89x\n-----END PUBLIC KEY-----",
  },
  step3: {
    dataPrivacyOfficerName: "Divine Mutesi",
    dataPrivacyOfficerEmail: "dpo@kigali-bank.rw",
    amlComplianceApproved: true,
    kycAuditSignedDate: "2026-06-15",
    licenseDocumentName: "BNR_Operating_License_2025.pdf",
  },
  fieldMappings: defaultFieldMappings,
};

export const useOnboardingState = () => {
  const [state, setState] = useState<OnboardingState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved onboarding state", e);
      }
    }
    return initialFormState;
  });

  const [isSaving, setIsSaving] = useState(false);

  // Auto-save draft to localStorage & simulate backend sync every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSaving(true);
      const updatedState = { ...state, lastSavedAt: new Date().toLocaleTimeString() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedState));
      setTimeout(() => setIsSaving(false), 400);
    }, 15000);

    return () => clearInterval(interval);
  }, [state]);

  const updateStep1 = (data: Partial<Step1Data>) => {
    setState((prev) => ({
      ...prev,
      step1: { ...prev.step1, ...data },
      lastSavedAt: new Date().toLocaleTimeString(),
    }));
  };

  const updateStep2 = (data: Partial<Step2Data>) => {
    setState((prev) => ({
      ...prev,
      step2: { ...prev.step2, ...data },
      lastSavedAt: new Date().toLocaleTimeString(),
    }));
  };

  const updateStep3 = (data: Partial<Step3Data>) => {
    setState((prev) => ({
      ...prev,
      step3: { ...prev.step3, ...data },
      lastSavedAt: new Date().toLocaleTimeString(),
    }));
  };

  const updateFieldMapping = (index: number, updated: FieldMappingRule) => {
    setState((prev) => {
      const nextMappings = [...prev.fieldMappings];
      nextMappings[index] = updated;
      return { ...prev, fieldMappings: nextMappings, lastSavedAt: new Date().toLocaleTimeString() };
    });
  };

  const setStep = (stepNumber: number) => {
    if (stepNumber >= 1 && stepNumber <= 5) {
      setState((prev) => ({ ...prev, currentStep: stepNumber }));
    }
  };

  const submitOnboarding = async () => {
    setIsSaving(true);
    await new Promise((res) => setTimeout(res, 1200));
    const nextState: OnboardingState = {
      ...state,
      status: "SUBMITTED",
      lastSavedAt: new Date().toLocaleTimeString(),
    };
    setState(nextState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    setIsSaving(false);
    return true;
  };

  const resetOnboarding = () => {
    setState(initialFormState);
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    state,
    isSaving,
    setStep,
    updateStep1,
    updateStep2,
    updateStep3,
    updateFieldMapping,
    submitOnboarding,
    resetOnboarding,
  };
};
