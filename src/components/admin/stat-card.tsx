interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  gradient: string;
  subtitle?: string;
}

export default function StatCard({ title, value, icon, gradient, subtitle }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-base shadow-sm shrink-0`}>
          <span className="drop-shadow-sm">{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-gray-500 font-medium truncate">{title}</p>
          <p className="text-base font-bold text-gray-800 leading-tight">{value}</p>
          {subtitle && <p className="text-[9px] text-gray-400 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}