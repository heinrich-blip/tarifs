import { CheckCircle2, Clock, Truck, AlertCircle } from 'lucide-react';
import { LoadStatus } from '@/types/load';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: LoadStatus;
  size?: 'sm' | 'md';
}

const statusConfig = {
  scheduled: {
    label: 'Scheduled',
    icon: Clock,
    className: 'status-scheduled',
  },
  'in-transit': {
    label: 'In Transit',
    icon: Truck,
    className: 'status-in-transit',
  },
  pending: {
    label: 'Pending',
    icon: AlertCircle,
    className: 'status-pending',
  },
  delivered: {
    label: 'Delivered',
    icon: CheckCircle2,
    className: 'status-delivered',
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn(
      'status-badge',
      config.className,
      size === 'sm' && 'text-[10px] px-2 py-0.5'
    )}>
      <Icon className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {config.label}
    </span>
  );
}
