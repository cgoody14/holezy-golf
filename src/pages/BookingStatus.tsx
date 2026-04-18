import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Clock, XCircle, Loader2, Calendar, MapPin, Users } from 'lucide-react';

interface JobStatus {
  id: string;
  status: 'pending' | 'booked' | 'failed' | 'cancelled';
  course_name: string;
  booking_date: string;
  earliest_time: string;
  latest_time: string;
  player_count: number;
  booking_platform: string;
  attempts: number;
  confirmation_code: string | null;
  last_error: string | null;
  updated_at: string;
}

const POLL_INTERVAL_MS = 8_000;

const STATUS_CONFIG = {
  pending: {
    icon: <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />,
    title: "Searching for your tee time…",
    description: "We're monitoring availability and will book the moment a slot opens.",
    cardClass: "border-blue-200 bg-blue-50",
  },
  booked: {
    icon: <CheckCircle className="w-12 h-12 text-green-500" />,
    title: "Tee time booked!",
    description: "Your spot is confirmed. Check your email for details.",
    cardClass: "border-green-200 bg-green-50",
  },
  failed: {
    icon: <XCircle className="w-12 h-12 text-red-500" />,
    title: "Booking unsuccessful",
    description: "We weren't able to secure a tee time. You will not be charged.",
    cardClass: "border-red-200 bg-red-50",
  },
  cancelled: {
    icon: <XCircle className="w-12 h-12 text-gray-400" />,
    title: "Booking cancelled",
    description: "This booking request has been cancelled.",
    cardClass: "border-gray-200 bg-gray-50",
  },
};

const TERMINAL_STATES = new Set(['booked', 'failed', 'cancelled']);

const BookingStatus = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const { toast }           = useToast();
  const [job, setJob]       = useState<JobStatus | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    if (!jobId) return;
    const { data, error: fnError } = await supabase.functions.invoke('get-job-status', {
      body: { job_id: jobId },
    });
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Job not found');
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setJob(data as JobStatus);
    if (TERMINAL_STATES.has(data.status)) {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleCancel = async () => {
    if (!jobId || !window.confirm('Cancel this booking request? Your payment authorization will be released.')) return;
    setCancelling(true);
    const { data, error: fnError } = await supabase.functions.invoke('cancel-booking', {
      body: { job_id: jobId },
    });
    if (fnError || data?.error) {
      toast({ title: 'Cancel failed', description: data?.error ?? fnError?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Booking cancelled', description: 'Your payment authorization has been released.' });
      fetchStatus();
    }
    setCancelling(false);
  };

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [jobId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">{error}</p>
            <Button asChild><Link to="/">Go home</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.pending;

  const formattedDate = new Date(job.booking_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        <Card className={`border-2 ${cfg.cardClass}`}>
          <CardContent className="pt-8 pb-6 text-center space-y-3">
            <div className="flex justify-center">{cfg.icon}</div>
            <h1 className="text-2xl font-bold text-gray-900">{cfg.title}</h1>
            <p className="text-gray-600">{cfg.description}</p>
            {job.status === 'pending' && (
              <p className="text-sm text-blue-600">
                Attempt {job.attempts} in progress — checking again every few seconds
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{job.course_name}</span>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{job.earliest_time} – {job.latest_time}</span>
            </div>
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{job.player_count} {job.player_count === 1 ? 'player' : 'players'}</span>
            </div>
          </CardContent>
        </Card>

        {job.confirmation_code && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-green-700 font-medium">Confirmation #</p>
              <p className="text-xl font-mono font-bold text-green-800">{job.confirmation_code}</p>
            </CardContent>
          </Card>
        )}

        {job.status === 'failed' && job.last_error && (
          <p className="text-xs text-gray-400 text-center">{job.last_error}</p>
        )}

        <div className="flex flex-col items-center gap-3">
          {job.status === 'pending' && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
              className="w-full sm:w-auto"
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Cancel Booking Request
            </Button>
          )}
          <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
        </div>
      </div>
    </div>
  );
};

export default BookingStatus;
