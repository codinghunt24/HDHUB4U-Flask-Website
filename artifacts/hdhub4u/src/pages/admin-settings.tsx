import { useGetAdminSettings, useUpdateAdminSettings } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const settingsSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  siteDescription: z.string(),
  contactEmail: z.string().email("Valid email required"),
  analyticsId: z.string().nullable(),
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
    },
  });

  useEffect(() => {
    if (settings && !initialized.current) {
      form.reset({
        siteName: settings.siteName,
        siteDescription: settings.siteDescription,
        contactEmail: settings.contactEmail,
        analyticsId: settings.analyticsId || "",
      });
      initialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    const payload = {
      ...values,
      analyticsId: values.analyticsId || null
    };

    updateSettings.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Settings saved", description: "Global configuration updated successfully." });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/admin"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/public"] });
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

      <Card className="border-0 shadow-sm rounded-2xl max-w-2xl">
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
