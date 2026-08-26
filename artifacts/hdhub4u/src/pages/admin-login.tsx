import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAdminLogin, useGetAdminSession } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Film, LockKeyhole } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { data: session } = useGetAdminSession();
  const login = useAdminLogin();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (session?.authenticated) {
      setLocation("/admin/posts");
    }
  }, [session, setLocation]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Welcome back", description: "Successfully logged in." });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/session"] });
        setLocation("/admin/posts");
      },
      onError: (err) => {
        toast({ 
          variant: "destructive", 
          title: "Login failed", 
          description: "Invalid credentials. Please try again." 
        });
      }
    });
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-md mx-auto">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center rotate-3 shadow-lg border-2 border-primary-border">
            <LockKeyhole className="w-8 h-8 -rotate-3" />
          </div>
        </div>
        
        <Card className="border-0 shadow-xl rounded-2xl">
          <CardHeader className="text-center space-y-2 pt-8">
            <CardTitle className="text-2xl font-display font-bold">Control Room</CardTitle>
            <CardDescription>Enter your credentials to access the admin area.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="admin@hdhub4u.com" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full h-11 font-bold text-base mt-2" 
                  disabled={login.isPending}
                  data-testid="button-login-submit"
                >
                  {login.isPending ? "Authenticating..." : "Sign In"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
