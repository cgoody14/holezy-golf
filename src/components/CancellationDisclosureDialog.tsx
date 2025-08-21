import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Phone, AlertTriangle } from 'lucide-react';

interface CancellationDisclosureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: () => void;
}

const CancellationDisclosureDialog = ({ 
  isOpen, 
  onClose, 
  onConfirmCancel 
}: CancellationDisclosureDialogProps) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>Important Cancellation Policy</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              <strong>Please Note:</strong> To cancel this tee time booking, you must call the golf course directly.
            </p>
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 text-sm">
                <Phone className="w-4 h-4 text-primary" />
                <span className="font-semibold">What you need to do:</span>
              </div>
              <ul className="mt-2 text-sm space-y-1 ml-6">
                <li>• Call the golf course directly</li>
                <li>• Reference your booking confirmation details</li>
                <li>• Follow their cancellation policy</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              By proceeding with cancellation here, you acknowledge that you still need to contact 
              the course directly to ensure your tee time is properly cancelled.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            Keep Booking
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmCancel}>
            I Understand - Cancel Here
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CancellationDisclosureDialog;