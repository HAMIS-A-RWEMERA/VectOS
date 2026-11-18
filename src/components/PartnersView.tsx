import React, { useState, useEffect } from 'react';
import { PartnerShop, User } from '../types';
import { api } from '../services/api';
import { hasPermission } from '../utils/permissions';
import { useLanguage } from '../i18n/LanguageContext';
import { 
  Handshake, 
  Plus, 
  Store, 
  Phone, 
  MapPin, 
  DollarSign, 
  ArrowRightLeft, 
  CheckCircle2 
} from 'lucide-react';

interface PartnersViewProps {
  user: User | null;
}

export const PartnersView: React.FC<PartnersViewProps> = ({ user }) => {
  const { tf } = useLanguage();
  const [partners, setPartners] = useState<PartnerShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newPartner, setNewPartner] = useState({
    name: '',
    contact_person: '',
    phone: '',
    address: 'Kigali Commercial District'
  });
  const [modalError, setModalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPartners();
    }
  }, [user]);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const res = await api.getPartners();
      setPartners(res.partners || []);
    } catch (err: any) {
      if (err?.message?.includes('log in') || err?.message?.includes('Authentication Required')) {
        return;
      }
      console.error('Error fetching partner shops:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartner.name) {
      setModalError(tf('Partner Shop Name is required.', 'Izina ry’iduka mukorana rirakenewe.'));
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError('');
      await api.createPartner(newPartner);
      setIsAddModalOpen(false);
      setNewPartner({ name: '', contact_person: '', phone: '', address: 'Kigali Commercial District' });
      fetchPartners();
    } catch (err: any) {
      setModalError(err.message || tf('Failed to add partner store.', 'Kongeramo iduka mukorana byanze.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRwf = (val: number) => `RWF ${Math.round(val || 0).toLocaleString()}`;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
              {tf('Partner Shops', 'Amaduka Mukorana')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {partners.length} {tf('Partner Shops', 'Amaduka Mukorana')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {tf('Neighboring shops you borrow stock from or share items with when out of stock.', 'Amaduka y’abaturanyi mutiramo ibicuruzwa cyangwa muguraniraho iyo bishize.')}
          </p>
        </div>

        {hasPermission(user, 'can_manage_partners') && (
          <button
            onClick={() => {
              setModalError('');
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{tf('Add Partner Shop', 'Ongeramo Iduka Mukorana')}</span>
          </button>
        )}
      </div>

      {/* Partners Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {partners.map((partner) => (
          <div
            key={partner.id}
            className="p-5 rounded-2xl bg-[#121620] border border-slate-800 hover:border-slate-700 transition space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{partner.name}</h3>
                  <p className="text-xs text-slate-400">{partner.contact_person || tf('Store Owner', 'Nyir’iduka')}</p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {tf('Connected', 'Rirakora')}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">{partner.phone || '0788 ...'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{partner.address || 'Kigali Commercial Area'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">{tf('Current Borrow Balance', 'Ideni ry’Ibyatijwe Ubu')}</span>
              <span className="font-mono font-bold text-amber-400">
                {formatRwf(partner.current_balance || 0)}
              </span>
            </div>
          </div>
        ))}

        {partners.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400">
            <Handshake className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            <p className="font-semibold text-slate-300">{tf('No partner stores registered', 'Nta maduka mukorana arandikwa')}</p>
            <p className="text-xs text-slate-400 mt-1">{tf('Add neighboring hardware retailers to record cross-borrowed stock.', 'Ongeramo amaduka y’abaturanyi kugira ngo ukurikirane ibicuruzwa mutirana.')}</p>
          </div>
        )}
      </div>

      {/* Add Partner Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#141923] border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">{tf('Add Partner Shop', 'Ongeramo Iduka Mukorana')}</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreatePartner} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Store Name *', 'Izina ry’Iduka *')}</label>
                <input
                  type="text"
                  required
                  placeholder={tf('e.g. Nyarugenge Hardware Supplies', 'urugero: Nyarugenge Hardware Supplies')}
                  value={newPartner.name}
                  onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Contact Person / Owner', 'Uhagarariye / Nyir’iduka')}</label>
                <input
                  type="text"
                  placeholder={tf('e.g. Emmanuel Ndayisaba', 'urugero: Emmanuel Ndayisaba')}
                  value={newPartner.contact_person}
                  onChange={(e) => setNewPartner({ ...newPartner, contact_person: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('Phone Number', 'Nomero ya Telefoni')}</label>
                <input
                  type="text"
                  placeholder="0788 456 789"
                  value={newPartner.phone}
                  onChange={(e) => setNewPartner({ ...newPartner, phone: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">{tf('District / Location', 'Akarere / Aho Riherereye')}</label>
                <input
                  type="text"
                  placeholder={tf('e.g. Downtown Commercial Street, Kigali', 'urugero: Mu Mujyi wa Kigali')}
                  value={newPartner.address}
                  onChange={(e) => setNewPartner({ ...newPartner, address: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {modalError && <p className="text-xs text-rose-400 font-semibold">{modalError}</p>}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  {tf('Cancel', 'Hagarika')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
                >
                  {isSubmitting ? tf('Saving...', 'Birabikwa...') : tf('Add Partner Store', 'Bika Iduka Mukorana')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
