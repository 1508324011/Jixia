import { providerRecordKeyMaxLength } from "@jixia/shared";

const openAlexRecordKeyPattern = /^W\d+$/u;
const pubmedRecordKeyPattern = /^\d{1,16}$/u;
const pmcRecordKeyPattern = /^PMC\d{1,16}$/u;

export function isCanonicalOpenAlexRecordKey(value: string): boolean {
  return value.length <= providerRecordKeyMaxLength && openAlexRecordKeyPattern.test(value);
}

export function isCanonicalPubmedRecordKey(value: string): boolean {
  return pubmedRecordKeyPattern.test(value);
}

export function isCanonicalPmcRecordKey(value: string): boolean {
  return pmcRecordKeyPattern.test(value);
}
