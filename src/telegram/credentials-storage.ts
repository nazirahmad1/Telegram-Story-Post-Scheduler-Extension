import { storageGet, storageSet, storageRemove } from "../utils/storage-backend";

const CUSTOM_API_CREDENTIALS_KEY = "storyExtension.customApiCredentials";

export interface ApiCredentials {
  apiId: number;
  apiHash: string;
}

export async function getCustomApiCredentials(): Promise<ApiCredentials | null> {
  const value = await storageGet<ApiCredentials>(CUSTOM_API_CREDENTIALS_KEY);
  if (!value || !Number.isFinite(value.apiId) || !value.apiHash) return null;
  return value;
}

export async function setCustomApiCredentials(credentials: ApiCredentials): Promise<void> {
  await storageSet(CUSTOM_API_CREDENTIALS_KEY, credentials);
}

export async function clearCustomApiCredentials(): Promise<void> {
  await storageRemove(CUSTOM_API_CREDENTIALS_KEY);
}
