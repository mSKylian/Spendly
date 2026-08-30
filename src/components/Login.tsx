import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Shield, TrendingUp, Sparkles, Wallet, Mail, Lock, User, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: () => Promise<void>;
  onEmailLogin: (email: string) => Promise<void>;
  isLoading: boolean;
}

export default function Login({ onLogin, onEmailLogin, isLoading }: LoginProps) {
  const [mode, setMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleEmailAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await onEmailLogin(email);
      setSuccess(true);
    } catch (err: any) {
      let msg = err.message || 'Une erreur est survenue';
      if (msg.includes('auth/invalid-email')) {
        msg = "Email invalide.";
      }
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center p-6 text-white text-center">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl rounded-full -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 blur-3xl rounded-full -ml-32 -mb-32" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-sm"
      >
        <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center mb-6 border border-white/20 shadow-2xl mx-auto">
          <Wallet size={40} className="text-white" />
        </div>
        
        <h1 className="font-display text-4xl font-extrabold tracking-tight mb-2">Spendly</h1>
        <p className="text-sm opacity-70 mb-10 font-medium leading-relaxed">
          Ton coach financier personnel.
        </p>

        <AnimatePresence mode="wait">
          {mode === 'google' ? (
            <motion.div 
              key="google"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <button
                onClick={onLogin}
                disabled={isLoading}
                className="w-full bg-white text-primary py-4 rounded-2xl font-extrabold uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all hover:bg-opacity-95 disabled:opacity-50"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <><LogIn size={20} /> Google</>}
              </button>
              
              <div className="flex items-center gap-4 my-6 opacity-30">
                <div className="h-px flex-1 bg-white" />
                <span className="text-[10px] font-bold uppercase tracking-widest">OU</span>
                <div className="h-px flex-1 bg-white" />
              </div>

              <button
                onClick={() => setMode('email')}
                className="w-full bg-white/10 hover:bg-white/20 border border-white/20 py-4 rounded-2xl font-extrabold uppercase tracking-widest transition-all flex items-center justify-center gap-3"
              >
                <Mail size={20} /> Email
              </button>
            </motion.div>
          ) : (
            <motion.form 
              key="email-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleEmailAction}
              className="space-y-4"
            >
              {success ? (
                <div className="bg-white/10 border border-white/20 rounded-2xl p-6 text-sm">
                  <Mail className="mx-auto mb-3 opacity-60 flex-shrink-0" size={32} />
                  <p className="font-bold mb-1">Vérifie tes emails</p>
                  <p className="opacity-70 text-xs">Un lien magique t'a été envoyé sur <br/> <strong className="opacity-100">{email}</strong>.</p>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <input 
                      type="email" 
                      placeholder="Email" 
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold placeholder:text-white/40 focus:bg-white/20 outline-none transition-all"
                    />
                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
                  </div>

                  {error && <p className="text-[10px] font-bold text-red-300 uppercase tracking-wider">{error}</p>}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-white text-primary py-4 rounded-2xl font-extrabold uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 transition-all hover:bg-opacity-95 disabled:opacity-50"
                  >
                    {isLoading ? <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <>Recevoir un lien magique <ArrowRight size={18} /></>}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => { setMode('google'); setSuccess(false); }}
                className="block mx-auto text-[10px] font-bold uppercase tracking-widest opacity-40 mt-4 hover:opacity-80"
              >
                Retour
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-3 gap-4 pt-12">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <Shield size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Sécurisé</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">IA Coach</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Smart</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
