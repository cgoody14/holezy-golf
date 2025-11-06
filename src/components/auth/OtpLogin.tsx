import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Phone, Send, CheckCircle2, Loader2 } from 'lucide-react';

interface OtpLoginProps {
  onSuccess?: () => void;
}

const OtpLogin = ({ onSuccess }: OtpLoginProps) => {
  const { toast } = useToast();
  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendCode = async () => {
    try {
      setSending(true);
      const redirectUrl = `${window.location.origin}/`;

      if (method === 'email') {
        if (!email) {
          toast({ title: 'Email required', description: 'Please enter your email.', variant: 'destructive' });
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true, emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
      } else {
        if (!phone) {
          toast({ title: 'Phone required', description: 'Please enter your phone number.', variant: 'destructive' });
          return;
        }
        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: { channel: 'sms' },
        } as any);
        if (error) throw error;
      }

      setSent(true);
      setToken('');
      setResendIn(30);
      toast({ title: 'Code sent', description: `We sent a code to your ${method === 'email' ? 'email' : 'phone'}.` });
    } catch (error: any) {
      let description = error?.message || 'Unable to send code.';
      if (method === 'sms') {
        description += ' Make sure Phone provider is enabled and SMS is configured in Supabase.';
      }
      toast({ title: 'Failed to send code', description, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    try {
      if (!token || token.length < 4) {
        toast({ title: 'Enter code', description: 'Please enter the code you received.' });
        return;
      }
      setVerifying(true);

      if (method === 'email') {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'email',
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.verifyOtp({
          phone,
          token,
          type: 'sms',
        });
        if (error) throw error;
      }

      // Upsert client account if session exists
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;
      if (u) {
        await supabase
          .from('Client_Accounts')
          .upsert(
            {
              user_id: u.id,
              email: u.email,
              first_name: (u.user_metadata as any)?.first_name,
              last_name: (u.user_metadata as any)?.last_name,
              phone: (u.user_metadata as any)?.phone
            },
            { onConflict: 'user_id' }
          );
      }

      toast({ title: 'Signed in', description: 'You have been signed in successfully.' });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: 'Verification failed', description: error?.message || 'Invalid code.', variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const canResend = resendIn === 0 && !sending;

  return (
    <div className="space-y-4">
      <Tabs value={method} onValueChange={(v) => { setMethod(v as 'email' | 'sms'); setSent(false); setToken(''); }}>
        <TabsList className="grid w/full grid-cols-2">
          <TabsTrigger value="email">Email Code</TabsTrigger>
          <TabsTrigger value="sms">Text Message</TabsTrigger>
        </TabsList>
        <TabsContent value="email" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="otp-email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="sms" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp-phone">Phone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="otp-phone" type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-10" />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {!sent ? (
        <Button onClick={sendCode} className="w-full" disabled={sending}>
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send Code
        </Button>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="otp-code">Enter Code</Label>
            <div className="mt-2">
              <InputOTP maxLength={6} value={token} onChange={setToken}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button onClick={verifyCode} className="w-full" disabled={verifying}>
            {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Verify & Sign In
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            {canResend ? (
              <button type="button" onClick={sendCode} className="underline">
                Resend code
              </button>
            ) : (
              <span>Resend available in {resendIn}s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OtpLogin;
