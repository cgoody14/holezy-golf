import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, ExternalLink, RotateCcw } from 'lucide-react';

interface Job {
  id: string;
  status: string;
  golfer_email: string;
  golfer_name: string | null;
  course_name: string;
  booking_date: string;
  booking_platform: string;
  attempts: number;
  confirmation_code: string | null;
  last_error: string | null;
  fire_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-blue-100 text-blue-800',
  booked:    'bg-green-100 text-green-800',
  failed:    'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
};

const AdminJobs = () => {
  const { toast } = useToast();
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setFilter] = useState('all');
  const [retrying, setRetrying]   = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const body: Record<string, unknown> = { limit: 100 };
    if (statusFilter !== 'all') body.status = statusFilter;

    const { data, error } = await supabase.functions.invoke('admin-list-jobs', { body });

    if (error || data?.error) {
      toast({ title: 'Error', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      setJobs(data.jobs ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    const { data, error } = await supabase.functions.invoke('admin-retry-job', {
      body: { job_id: jobId },
    });
    if (error || data?.error) {
      toast({ title: 'Retry failed', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      toast({ title: 'Job reset', description: 'Job set back to pending.' });
      fetchJobs();
    }
    setRetrying(null);
  };

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scheduled Jobs</h1>
            <p className="text-sm text-gray-500">{total} total jobs</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {Object.entries(counts).map(([status, n]) => (
            <span key={status} className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
              {n} {status}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No jobs found.</div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <Card key={job.id} className="border border-gray-200">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLORS[job.status] ?? 'bg-gray-100'}`}>
                          {job.status}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">{job.course_name}</span>
                        <span className="text-xs text-gray-400">{job.booking_platform}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {job.golfer_name || job.golfer_email} · {job.booking_date} · {job.attempts} attempt{job.attempts !== 1 ? 's' : ''}
                      </div>
                      {job.confirmation_code && (
                        <div className="text-xs text-green-700 font-mono">Confirmed: {job.confirmation_code}</div>
                      )}
                      {job.last_error && (
                        <div className="text-xs text-red-600 truncate max-w-md">{job.last_error}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link to={`/booking-status/${job.id}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                      {(job.status === 'failed' || job.status === 'cancelled') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(job.id)}
                          disabled={retrying === job.id}
                        >
                          <RotateCcw className={`w-4 h-4 mr-1 ${retrying === job.id ? 'animate-spin' : ''}`} />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminJobs;
