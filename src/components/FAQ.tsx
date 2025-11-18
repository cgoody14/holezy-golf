import { useState, useEffect, useRef } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Play } from "lucide-react";

const FAQ = () => {
  const videoUrl = "https://azgnzhtqoyqlixfhlkyz.supabase.co/storage/v1/object/public/HolezyGolf/Tutorial.mov";
  const [thumbnail, setThumbnail] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.currentTime = 2; // Capture frame at 2 seconds
    
    video.addEventListener('loadeddata', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumbnail(canvas.toDataURL('image/jpeg', 0.8));
      }
    });
  }, []);
  const faqs = [
    {
      question: "How do I book a tee time?",
      answer: "Simply fill out our booking form with your preferred date, time range, number of players, and course preference. We'll handle the rest! You'll receive a confirmation email once your booking is secured."
    },
    {
      question: "What are your cancellation and reschedule policies?",
      answer: "You can cancel anytime before the teetime is made and get a full refund. If a booking has been made, please contact the course directly to cancel the tee time."
    },
    {
      question: "How much does the service cost?",
      answer: "Our concierge booking service costs just $5 per player. This fee covers our booking service and confirmation process. The actual green fees are paid directly to the golf course."
    },
    {
      question: "Which golf courses can you book?",
      answer: "We work with thousands of golf courses across the country. Our database includes public courses, semi-private courses, and select private courses that accept outside play."
    },
    {
      question: "How far in advance can I book?",
      answer: "You can book as far out as you would like. We will continuously check once tee times open and will send you a confirmation once a tee time has been booked."
    },
    {
      question: "What if my preferred time isn't available?",
      answer: "We will look to book tee times within the designated window you select when you complete the booking form."
    }
  ];

  return (
    <Card className="w-full max-w-4xl mx-auto golf-card-shadow">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl md:text-3xl font-bold">
          Frequently Asked Questions
        </CardTitle>
        <p className="text-muted-foreground">
          Everything you need to know about Holezy Golf's golf booking service
        </p>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-2">
          {faqs.map((faq, index) => (
            <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-4">
              <AccordionTrigger className="text-left hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* Video Tutorial Section */}
        <div className="mt-8 p-6 bg-muted/30 rounded-lg text-center">
          <h3 className="text-xl font-semibold mb-4">
            Watch How to Book Your Tee Time
          </h3>
          <p className="text-muted-foreground mb-4">
            See our step-by-step booking process in action
          </p>
          <Dialog>
            <DialogTrigger asChild>
              <div className="relative cursor-pointer group max-w-3xl mx-auto mb-4">
                {thumbnail ? (
                  <img 
                    src={thumbnail} 
                    alt="Tutorial video thumbnail"
                    className="w-full rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-full aspect-video bg-muted rounded-lg shadow-lg animate-pulse" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors rounded-lg">
                  <div className="w-20 h-20 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center transition-all shadow-xl">
                    <Play className="w-10 h-10 text-primary ml-1" fill="currentColor" />
                  </div>
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <video
                  controls
                  preload="metadata"
                  className="w-full h-full"
                  controlsList="nodownload"
                >
                  <source src={videoUrl} type="video/quicktime" />
                  <source src={videoUrl} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
};

export default FAQ;