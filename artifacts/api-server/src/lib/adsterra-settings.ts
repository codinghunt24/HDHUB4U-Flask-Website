export type AdsterraSettings = {
  adsterraEnabled?: boolean | null;
  adsterraTopEnabled?: boolean | null;
  adsterraTopCode?: string | null;
  adsterraContentEnabled?: boolean | null;
  adsterraContentCode?: string | null;
  adsterraSidebarEnabled?: boolean | null;
  adsterraSidebarCode?: string | null;
  adsterraFooterEnabled?: boolean | null;
  adsterraFooterCode?: string | null;
};

const cleanCode = (value: string | null | undefined) => value?.trim() || null;

export const getPublicAdSettings = (
  settings: AdsterraSettings | undefined,
) => {
  const enabled = Boolean(settings?.adsterraEnabled);
  return {
    adsterraEnabled: enabled,
    adsterraTopCode:
      enabled && settings?.adsterraTopEnabled
        ? cleanCode(settings.adsterraTopCode)
        : null,
    adsterraContentCode:
      enabled && settings?.adsterraContentEnabled
        ? cleanCode(settings.adsterraContentCode)
        : null,
    adsterraSidebarCode:
      enabled && settings?.adsterraSidebarEnabled
        ? cleanCode(settings.adsterraSidebarCode)
        : null,
    adsterraFooterCode:
      enabled && settings?.adsterraFooterEnabled
        ? cleanCode(settings.adsterraFooterCode)
        : null,
  };
};

export const getAdminAdSettings = (
  settings: AdsterraSettings | undefined,
) => ({
  adsterraEnabled: settings?.adsterraEnabled ?? false,
  adsterraTopEnabled: settings?.adsterraTopEnabled ?? true,
  adsterraTopCode: settings?.adsterraTopCode ?? null,
  adsterraContentEnabled: settings?.adsterraContentEnabled ?? true,
  adsterraContentCode: settings?.adsterraContentCode ?? null,
  adsterraSidebarEnabled: settings?.adsterraSidebarEnabled ?? true,
  adsterraSidebarCode: settings?.adsterraSidebarCode ?? null,
  adsterraFooterEnabled: settings?.adsterraFooterEnabled ?? true,
  adsterraFooterCode: settings?.adsterraFooterCode ?? null,
});