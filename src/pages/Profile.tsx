import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User, 
  Calendar, 
  Clock, 
  Users, 
  MapPin, 
  X, 
  Mail, 
  Phone,
  CreditCard,
  AlertCircle,
  Edit2,
  Save
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import CancellationDisclosureDialog from '@/components/CancellationDisclosureDialog';

interface Booking {
  id: number;
  First: string;
  Last: string;
  email: string;
  phone: string;
  booking_date: string;
  earliest_time: string;
  latest_time: string;
  number_of_players: number;
  preferred_course: string;
  booking_status: string;
  total_price: number;
  promo_code?: string;
  created_at: string;
  cancelled?: boolean;
  cancelled_at?: string;
}

const Profile = () => {
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancellationDialog, setShowCancellationDialog] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [accountInfo, setAccountInfo] = useState({
    username: '',
    phone: '',
    firstName: '',
    lastName: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedInfo, setEditedInfo] = useState(accountInfo);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    loadBookings();
    loadAccountInfo();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    } else {
      setUser(session.user);
    }
  };

  const loadAccountInfo = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data, error } = await supabase
        .from('Client_Accounts')
        .select('username, phone, first_name, last_name')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const info = {
          username: data.username || '',
          phone: data.phone || '',
          firstName: data.first_name || '',
          lastName: data.last_name || ''
        };
        setAccountInfo(info);
        setEditedInfo(info);
      }
    } catch (error) {
      console.error('Error loading account info:', error);
    }
  };

  const loadBookings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) return;

      const { data, error } = await supabase
        .from('Client_Bookings')
        .select('*')
        .eq('email', session.user.email)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error('Error loading bookings:', error);
      toast({
        title: "Error loading bookings",
        description: "Please try refreshing the page",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelClick = (booking: Booking) => {
    setBookingToCancel(booking);
    setShowCancellationDialog(true);
  };

  const handleCancelConfirm = async () => {
    if (!bookingToCancel) return;

    try {
      const { error } = await supabase
        .from('Client_Bookings')
        .update({ 
          booking_status: 'cancelled',
          cancelled: true,
          cancelled_at: new Date().toISOString()
        })
        .eq('id', bookingToCancel.id);

      if (error) throw error;

      toast({
        title: "Booking Cancelled",
        description: "Your booking has been cancelled. Please remember to call the golf course directly to confirm the cancellation."
      });

      setShowCancellationDialog(false);
      setBookingToCancel(null);
      loadBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Error cancelling booking",
        description: "Please try again or contact support",
        variant: "destructive"
      });
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    try {
      const { error } = await supabase
        .from('Client_Bookings')
        .update({ 
          booking_status: 'cancelled',
          cancelled: true,
          cancelled_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) throw error;

      toast({
        title: "Booking Cancelled",
        description: "Your booking has been cancelled successfully"
      });

      // Refresh bookings
      loadBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast({
        title: "Error cancelling booking",
        description: "Please try again or contact support",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const canCancelBooking = (booking: Booking) => {
    return booking.booking_status.toLowerCase() === 'pending';
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset to original values
      setEditedInfo(accountInfo);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveAccountInfo = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      // First, check if there's an existing account with this email but no user_id
      const { data: existingAccount } = await supabase
        .from('Client_Accounts')
        .select('id')
        .eq('email', session.user.email)
        .is('user_id', null)
        .maybeSingle();

      let error;

      if (existingAccount) {
        // Update the existing record to link it to this user
        const updateResult = await supabase
          .from('Client_Accounts')
          .update({
            user_id: session.user.id,
            phone: editedInfo.phone,
            first_name: editedInfo.firstName,
            last_name: editedInfo.lastName
          })
          .eq('id', existingAccount.id);
        error = updateResult.error;
      } else {
        // No existing record, do upsert
        const upsertResult = await supabase
          .from('Client_Accounts')
          .upsert({
            user_id: session.user.id,
            phone: editedInfo.phone,
            first_name: editedInfo.firstName,
            last_name: editedInfo.lastName
          }, {
            onConflict: 'user_id'
          });
        error = upsertResult.error;
      }

      if (error) throw error;

      // Reload account info from database to ensure it's saved
      await loadAccountInfo();
      setIsEditing(false);
      
      toast({
        title: "Profile Updated",
        description: "Your account information has been saved successfully"
      });
    } catch (error) {
      console.error('Error updating account info:', error);
      toast({
        title: "Error updating profile",
        description: "Please try again or contact support",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Your Profile</h1>
          <p className="text-lg text-muted-foreground">{user.email}</p>
        </div>

        {/* Account Info */}
        <Card className="golf-card-shadow mb-8">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5 text-primary" />
                <span>Account Information</span>
              </div>
              <Button
                variant={isEditing ? "outline" : "ghost"}
                size="sm"
                onClick={isEditing ? handleSaveAccountInfo : handleEditToggle}
              >
                {isEditing ? (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </>
                )}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-medium">
                    {new Date(user.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
              {isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={editedInfo.firstName}
                      onChange={(e) => setEditedInfo({ ...editedInfo, firstName: e.target.value })}
                      placeholder="Enter first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={editedInfo.lastName}
                      onChange={(e) => setEditedInfo({ ...editedInfo, lastName: e.target.value })}
                      placeholder="Enter last name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={editedInfo.phone}
                      onChange={(e) => setEditedInfo({ ...editedInfo, phone: e.target.value })}
                      placeholder="Enter phone number"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">
                        {accountInfo.firstName || accountInfo.lastName 
                          ? `${accountInfo.firstName} ${accountInfo.lastName}`.trim()
                          : 'Not set'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Username</p>
                      <p className="font-medium">{accountInfo.username || 'Not set'}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Phone Number</p>
                      <p className="font-medium">{accountInfo.phone || 'Not set'}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {isEditing && (
              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={handleEditToggle}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking History */}
        <Card className="golf-card-shadow">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span>Your Bookings</span>
            </CardTitle>
            <CardDescription>
              Manage your tee time requests and confirmed bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Bookings Yet</h3>
                <p className="text-muted-foreground mb-6">
                  You haven't made any tee time requests yet.
                </p>
                <Button onClick={() => navigate('/book')}>
                  Book Your First Tee Time
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {bookings.map((booking) => (
                  <Card key={booking.id} className="border-l-4 border-l-primary">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                        <div className="space-y-3">
                          {/* Booking Status and Date */}
                          <div className="flex items-center space-x-3">
                            <Badge className={getStatusColor(booking.booking_status)}>
                              {booking.booking_status.charAt(0).toUpperCase() + booking.booking_status.slice(1)}
                              {booking.cancelled && booking.cancelled_at && (
                                <span className="ml-1">
                                  - {new Date(booking.cancelled_at).toLocaleDateString()}
                                </span>
                              )}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Requested on {new Date(booking.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Course and Date */}
                          <div className="space-y-2">
                            <div className="flex items-start space-x-2">
                              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                              <span className="font-medium">{booking.preferred_course}</span>
                            </div>
                            
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span>
                                  {new Date(booking.booking_date).toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span>
                                  {formatTime(booking.earliest_time)} - {formatTime(booking.latest_time)}
                                </span>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <Users className="w-4 h-4 text-muted-foreground" />
                                <span>{booking.number_of_players} player{booking.number_of_players > 1 ? 's' : ''}</span>
                              </div>
                            </div>
                          </div>

                          {/* Contact and Payment Info */}
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <div className="flex items-center space-x-1">
                              <Phone className="w-3 h-3" />
                              <span>{booking.phone}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <CreditCard className="w-3 h-3" />
                              <span>${booking.total_price}.00</span>
                            </div>
                            {booking.promo_code && (
                              <Badge variant="outline" className="text-xs">
                                {booking.promo_code}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex space-x-2">
                          {canCancelBooking(booking) && (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => handleCancelClick(booking)}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <CancellationDisclosureDialog
          isOpen={showCancellationDialog}
          onClose={() => {
            setShowCancellationDialog(false);
            setBookingToCancel(null);
          }}
          onConfirmCancel={handleCancelConfirm}
        />
      </div>
    </div>
  );
};

export default Profile;