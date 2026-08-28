import {
  getGetAdminSettingsQueryKey,
  getGetPublicSettingsQueryKey,
  useGetAdminSettings,
  useUpdateAdminSettings,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const settingsSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  siteDescription: z.string(),
  contactEmail: z.string().email("Valid email required"),
  analyticsId: z.string().nullable(),
  adsterraEnabled: z.boolean(),
  adsterraTopEnabled: z.boolean(),
  adsterraTopCode: z.string().max(30000).nullable(),
  adsterraContentEnabled: z.boolean(),
  adsterraContentCode: z.string().max(30000).nullable(),
  adsterraSidebarEnabled: z.boolean(),
  adsterraSidebarCode: z.string().max(30000).nullable(),
  adsterraFooterEnabled: z.boolean(),
  adsterraFooterCode: z.string().max(30000).nullable(),
});

export default function AdminSettings() {
  const { data: settings, isLoading } = useGetAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialized = useRef(false);

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      siteName: "",
      siteDescription: "",
      contactEmail: "",
      analyticsId: "",
      adsterraEnabled: false,
      adsterraTopEnabled: true,
      adsterraTopCode: "",
      adsterraContentEnabled: true,
      adsterraContentCode: "",
      adsterraSidebarEnabled: true,
      adsterraSidebarCode: "",
      adsterraFooterEnabled: true,
      adsterraFooterCode: "",
    },
  });

  useEffect(() => {
    if (settings && !initialized.current) {
      form.reset({
        siteName: settings.siteName,
        siteDescription: settings.siteDescription,
        contactEmail: settings.contactEmail,
        analyticsId: settings.analyticsId || "",
        adsterraEnabled: settings.adsterraEnabled,
        adsterraTopEnabled: settings.adsterraTopEnabled,
        adsterraTopCode: settings.adsterraTopCode || "",
        adsterraContentEnabled: settings.adsterraContentEnabled,
        adsterraContentCode: settings.adsterraContentCode || "",
        adsterraSidebarEnabled: settings.adsterraSidebarEnabled,
        adsterraSidebarCode: settings.adsterraSidebarCode || "",
        adsterraFooterEnabled: settings.adsterraFooterEnabled,
        adsterraFooterCode: settings.adsterraFooterCode || "",
      });
      initialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    const payload = {
      ...values,
      analyticsId: values.analyticsId || null,
      adsterraTopCode: values.adsterraTopCode?.trim() || null,
      adsterraContentCode: values.adsterraContentCode?.trim() || null,
      adsterraSidebarCode: values.adsterraSidebarCode?.trim() || null,
      adsterraFooterCode: values.adsterraFooterCode?.trim() || null,
    };

    updateSettings.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Settings saved", description: "Global configuration updated successfully." });
        queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPublicSettingsQueryKey() });
      }
    });
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-8 max-w-2xl">
          <Skeleton className="h-10 w-48 mb-2" />
          <Card className="border-0 shadow-sm rounded-2xl p-6">
            <div className="space-y-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Site Settings</h1>
        <p className="text-muted-foreground">Manage global configuration, SEO, and identity.</p>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl max-w-4xl">
        <CardHeader>
          <CardTitle>General Identity</CardTitle>
          <CardDescription>This information is used in headers, footers, and SEO tags.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="siteName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="siteDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Description</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="pt-6 border-t">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Analytics</h3>
                <FormField
                  control={form.control}
                  name="analyticsId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Analytics ID</FormLabel>
                      <FormControl>
                        <Input placeholder="G-XXXXXXXXXX" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-6 border-t pt-6">
                <div className="flex flex-col gap-4 rounded-xl border bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
                      <Megaphone className="h-5 w-5 text-amber-600" />
                      Adsterra Ads
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm text-gray-600">
                      Paste only code supplied by your Adsterra dashboard. Ad code can run third-party scripts on public pages.
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="adsterraEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormLabel className="whitespace-nowrap">Enable all ads</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {([
                    ["Top banner", "Below the site header on every public page.", "adsterraTopEnabled", "adsterraTopCode"],
                    ["Content banner", "Above the main page content on public pages.", "adsterraContentEnabled", "adsterraContentCode"],
                    ["Desktop sidebar", "Right-side ad rail on wide home and category pages.", "adsterraSidebarEnabled", "adsterraSidebarCode"],
                    ["Footer banner", "Above the footer on every public page.", "adsterraFooterEnabled", "adsterraFooterCode"],
                  ] as const).map(([title, description, enabledName, codeName]) => (
                    <div key={codeName} className="space-y-4 rounded-xl border p-5">
                      <FormField
                        control={form.control}
                        name={enabledName}
                        render={({ field }) => (
                          <FormItem className="flex items-start justify-between gap-4 space-y-0">
                            <div>
                              <FormLabel className="text-base">{title}</FormLabel>
                              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={codeName}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Adsterra code</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                value={field.value || ""}
                                rows={7}
                                spellCheck={false}
                                placeholder="<script>...</script>"
                                className="font-mono text-xs"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateSettings.isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  {updateSettings.isPending ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
