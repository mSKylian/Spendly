import { Bell } from 'lucide-react';

export default function Header({ 
  title = 'Spendly', 
  avatar,
  onAvatarClick 
}: { 
  title?: string;
  avatar?: string;
  onAvatarClick?: () => void;
}) {
  return (
    <header className="bg-primary text-white h-16 flex items-center justify-between px-5 fixed top-0 w-full z-50 shadow-md">
      <div className="flex items-center gap-3">
        <button 
          onClick={onAvatarClick}
          className="w-10 h-10 rounded-full border-2 border-primary-fixed-dim/30 overflow-hidden bg-white/10 p-0.5 active:scale-95 transition-all"
        >
          <img 
            src={avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Kylian"} 
            alt="Profile" 
            className="w-full h-full object-cover rounded-full"
            referrerPolicy="no-referrer"
          />
        </button>
        <h1 className="font-display text-xl font-extrabold tracking-tight">{title}</h1>
      </div>
      <button className="p-2 hover:bg-white/10 rounded-full transition-all">
        <Bell size={24} />
      </button>
    </header>
  );
}
