import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import
  {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog';
import
  {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import
  {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useClients } from '@/hooks/useClients';
import { generateLoadId, Load, useCreateLoad, useUpdateLoad } from '@/hooks/useLoads';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import { CalendarIcon, Clock, Loader2, MapPin, RotateCcw, Truck, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateClientDialog } from './CreateClientDialog';

const formSchema = z.object({
  // Customer selection
  customerId: z.string().min(1, 'Customer is required'),
  // Loading location (return pickup point)
  loadingPlaceName: z.string().min(1, 'Loading place name is required'),
  loadingAddress: z.string().optional(),
  // Offloading location (return destination)
  offloadingPlaceName: z.string().min(1, 'Offloading place name is required'),
  offloadingAddress: z.string().optional(),
  // Dates
  loadingDate: z.date({ required_error: 'Loading date is required' }),
  offloadingDate: z.date({ required_error: 'Offloading date is required' }),
  // Time fields
  loadingPlannedArrival: z.string().min(1, 'Planned arrival time is required'),
  loadingPlannedDeparture: z.string().min(1, 'Planned departure time is required'),
  offloadingPlannedArrival: z.string().min(1, 'Planned arrival time is required'),
  offloadingPlannedDeparture: z.string().min(1, 'Planned departure time is required'),
  // Cargo
  cargoDescription: z.string().min(1, 'Cargo description is required'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddThirdPartyBackloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: Load | null;
}

// Parse existing time_window to get current data
function parseTimeWindow(timeWindow: string) {
  try {
    const data = JSON.parse(timeWindow);
    return {
      origin: data.origin || {},
      destination: data.destination || {},
      thirdParty: data.thirdParty || {},
      backload: data.backload || null,
    };
  } catch {
    return {
      origin: {},
      destination: {},
      thirdParty: {},
      backload: null,
    };
  }
}

export function AddThirdPartyBackloadDialog({ open, onOpenChange, load }: AddThirdPartyBackloadDialogProps) {
  const [createClientDialogOpen, setCreateClientDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const updateLoad = useUpdateLoad();
  const createLoad = useCreateLoad();
  const { data: clients = [] } = useClients();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      loadingPlaceName: '',
      loadingAddress: '',
      offloadingPlaceName: '',
      offloadingAddress: '',
      loadingPlannedArrival: '14:00',
      loadingPlannedDeparture: '16:00',
      offloadingPlannedArrival: '18:00',
      offloadingPlannedDeparture: '20:00',
      cargoDescription: '',
      notes: '',
    },
  });

  // Reset form when load changes
  useEffect(() => {
    if (load && open) {
      const times = parseTimeWindow(load.time_window);
      
      // Pre-fill with existing backload data if available
      if (times.backload?.enabled && times.backload?.isThirdParty) {
        const backload = times.backload;
        setIsEditMode(true);
        form.reset({
          customerId: backload.thirdParty?.customerId || '',
          loadingPlaceName: backload.origin?.placeName || '',
          loadingAddress: backload.origin?.address || '',
          offloadingPlaceName: backload.destination?.placeName || '',
          offloadingAddress: backload.destination?.address || '',
          loadingDate: backload.loadingDate ? parseISO(backload.loadingDate) : parseISO(load.offloading_date || load.loading_date),
          offloadingDate: backload.offloadingDate ? parseISO(backload.offloadingDate) : parseISO(load.offloading_date || load.loading_date),
          loadingPlannedArrival: backload.origin?.plannedArrival || '14:00',
          loadingPlannedDeparture: backload.origin?.plannedDeparture || '16:00',
          offloadingPlannedArrival: backload.destination?.plannedArrival || '18:00',
          offloadingPlannedDeparture: backload.destination?.plannedDeparture || '20:00',
          cargoDescription: backload.thirdParty?.cargoDescription || '',
          notes: backload.notes || '',
        });
      } else {
        // Default to same day as offloading date (or loading date if not available)
        setIsEditMode(false);
        const defaultDate = load.offloading_date ? parseISO(load.offloading_date) : parseISO(load.loading_date);
        form.reset({
          customerId: '',
          loadingPlaceName: load.destination, // Backload starts from original destination
          loadingAddress: '',
          offloadingPlaceName: '',
          offloadingAddress: '',
          loadingDate: defaultDate,
          offloadingDate: defaultDate,
          loadingPlannedArrival: '14:00',
          loadingPlannedDeparture: '16:00',
          offloadingPlannedArrival: '18:00',
          offloadingPlannedDeparture: '20:00',
          cargoDescription: '',
          notes: '',
        });
      }
    }
  }, [load, open, form]);

  const handleSubmit = (data: FormData) => {
    if (!load) return;

    const customer = clients.find(c => c.id === data.customerId);
    if (!customer) {
      toast.error('Customer not found');
      return;
    }

    // Parse existing time window data
    const existingTimeData = parseTimeWindow(load.time_window);

    // Build time_window for the new third-party load
    const newLoadTimeWindow = {
      origin: {
        placeName: data.loadingPlaceName,
        address: data.loadingAddress,
        plannedArrival: data.loadingPlannedArrival,
        plannedDeparture: data.loadingPlannedDeparture,
        actualArrival: '',
        actualDeparture: '',
      },
      destination: {
        placeName: data.offloadingPlaceName,
        address: data.offloadingAddress,
        plannedArrival: data.offloadingPlannedArrival,
        plannedDeparture: data.offloadingPlannedDeparture,
        actualArrival: '',
        actualDeparture: '',
      },
      thirdParty: {
        customerId: customer.id,
        customerName: customer.name,
        linkedLoadId: load.load_id,
      },
    };

    // Create a new third-party load with TP- prefix
    createLoad.mutate(
      {
        load_id: generateLoadId('TP'),
        priority: 'medium',
        loading_date: format(data.loadingDate, 'yyyy-MM-dd'),
        offloading_date: format(data.offloadingDate, 'yyyy-MM-dd'),
        time_window: JSON.stringify(newLoadTimeWindow),
        origin: data.loadingPlaceName,
        destination: data.offloadingPlaceName,
        cargo_type: 'Retail', // Third-party loads use Retail type
        quantity: 0,
        weight: 0,
        special_handling: [],
        fleet_vehicle_id: load.fleet_vehicle_id,
        driver_id: load.driver_id,
        co_driver_id: load.co_driver_id,
        notes: `[Third-Party Backload from ${load.load_id}]\nCustomer: ${customer.name}\nCargo: ${data.cargoDescription}${data.notes ? '\n' + data.notes : ''}`,
        status: 'scheduled',
      },
      {
        onSuccess: () => {
          // Also update parent load to reference the backload
          const updatedTimeData = {
            ...existingTimeData,
            backload: {
              enabled: true,
              isThirdParty: true,
              loadingDate: format(data.loadingDate, 'yyyy-MM-dd'),
              offloadingDate: format(data.offloadingDate, 'yyyy-MM-dd'),
              origin: {
                placeName: data.loadingPlaceName,
                address: data.loadingAddress,
                plannedArrival: data.loadingPlannedArrival,
                plannedDeparture: data.loadingPlannedDeparture,
              },
              destination: {
                placeName: data.offloadingPlaceName,
                address: data.offloadingAddress,
                plannedArrival: data.offloadingPlannedArrival,
                plannedDeparture: data.offloadingPlannedDeparture,
              },
              thirdParty: {
                customerId: customer.id,
                customerName: customer.name,
                cargoDescription: data.cargoDescription,
              },
              notes: data.notes,
            },
          };

          updateLoad.mutate(
            {
              id: load.id,
              time_window: JSON.stringify(updatedTimeData),
            },
            {
              onSuccess: () => {
                toast.success(isEditMode ? 'Third-party backload updated successfully' : 'Third-party backload created successfully');
                onOpenChange(false);
                form.reset();
              },
              onError: () => {
                toast.success('Third-party load created, but failed to link to parent load');
                onOpenChange(false);
                form.reset();
              },
            }
          );
        },
        onError: () => {
          toast.error('Failed to create third-party backload');
        },
      }
    );
  };

  if (!load) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              {isEditMode ? 'Edit Third-Party Backload' : 'Add Third-Party Backload'}
            </DialogTitle>
            <DialogDescription>
              {isEditMode 
                ? <>Update the third-party backload details for load <span className="font-semibold text-orange-600">{load.load_id}</span>.</>
                : <>Add a third-party backload for load <span className="font-semibold">{load.load_id}</span>. Configure the return journey with customer and location details.</>
              }
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {/* Customer Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Backload Customer</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateClientDialogOpen(true)}
                    className="gap-1.5"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    New Customer
                  </Button>
                </div>
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer for the backload" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="loadingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Backload Loading Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="offloadingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Backload Offloading Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Loading Location (Backload pickup) */}
              <div className="space-y-3 p-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
                <h4 className="font-medium flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <Truck className="h-4 w-4" />
                  Backload Pickup Location
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="loadingPlaceName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Place Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Customer Warehouse" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="loadingAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Full address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="loadingPlannedArrival"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Arrival Time
                        </FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="loadingPlannedDeparture"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Departure Time
                        </FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Offloading Location (Backload destination) */}
              <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                <h4 className="font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <MapPin className="h-4 w-4" />
                  Backload Destination
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="offloadingPlaceName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Place Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Return Destination" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="offloadingAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Full address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="offloadingPlannedArrival"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Arrival Time
                        </FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="offloadingPlannedDeparture"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Departure Time
                        </FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Cargo Description */}
              <FormField
                control={form.control}
                name="cargoDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo Description</FormLabel>
                    <FormControl>
                      <Input placeholder="What cargo is being returned?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Any additional notes for this backload..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createLoad.isPending || updateLoad.isPending || !form.watch('customerId')}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {(createLoad.isPending || updateLoad.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode ? 'Update Backload' : 'Add Backload'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Customer Dialog */}
      <CreateClientDialog
        open={createClientDialogOpen}
        onOpenChange={setCreateClientDialogOpen}
      />
    </>
  );
}
