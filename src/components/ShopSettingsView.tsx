import React, { useState, useEffect } from 'react';
import { Shop, User } from '../types';
import { api } from '../services/api';
import { hasPermission } from '../utils/permissions';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Hash,
  FileText,
  User as UserIcon,
  Save,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Eraser
} from 'lucide-react';

interface ShopSettingsViewProps {
  shop: Shop | null;
  user: User | null;
  onShopUpdated: (updatedShop: Shop) => void;
}

export const ShopSettingsView: React.FC<ShopSettingsViewProps> = ({
  shop,
  user,
  onShopUpdated
}) => {
  const { tf } = useLanguage();
  const canEdit = hasPermission(user, 'can_edit_company_settings');

  const [name, setName] = useState(shop?.name || '');
  const [ownerName, setOwnerName] = useState(shop?.owner_name || '');
  const [phone, setPhone] = useState(shop?.phone || '');
  const [email, setEmail] = useState(shop?.email || '');
  const [location, setLocation] = useState(shop?.location || '');
  const [tinNumber, setTinNumber] = useState(shop?.tin_number || '');
  const [receiptFooterText, setReceiptFooterText] = useState(shop?.receipt_footer_text || '');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (shop) {
      setName(shop.name || '');
      setOwnerName(shop.owner_name || '');
      setPhone(shop.phone || '');
      setEmail(shop.email || '');
      setLocation(shop.location || '');
      setTinNumber(shop.tin_number || '');
      setReceiptFooterText(shop.receipt_footer_text || '');
      setFeedback(null);
    }
  }, [shop]);

  if (!shop) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        {tf('No active shop selected.', 'Nta duka rihiswemo.')}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {tf(
            'You do not have permission to change business details for this shop. Ask the shop owner or manager to enable',
            'Nta ruhushya ufite rwo guhindura amakuru y’iri duka. Saba nyir’iduka cyangwa umuyobozi kwemeza'
          )}{' '}
          <strong>{tf('Edit shop name, phone & TIN', 'Guhindura izina ry’iduka, telefoni & TIN')}</strong>{' '}
          {tf('under Staff & Duties.', 'muri Abakozi n’Inshingano.')}
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!name.trim() || !phone.trim() || !email.trim()) {
      setFeedback({
        type: 'error',
        message: tf('Business name, phone number, and email address are required.', 'Izina ry’iduka, telefoni, na imeri birakenewe.')
      });
      return;
    }

    try {
      setSaving(true);
      const res = await api.updateShop(shop.id, {
        name: name.trim(),
        owner_name: ownerName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        location: location.trim(),
        tin_number: tinNumber.trim(),
        receipt_footer_text: receiptFooterText.trim()
      });

      if (res?.shop) {
        onShopUpdated(res.shop);
        setFeedback({
          type: 'success',
          message: tf(
            'Business details saved! All receipts, delivery notes, and print sheets now use this updated info.',
            'Amakuru y’iduka yabitswe! Inyemezabuguzi zose n’impapuro zo gusohora ubu bikoresha aya makuru mashya.'
          )
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || tf('Failed to save business details.', 'Kubika amakuru y’iduka byanze.')
      });
    } finally {
      setSaving(false);
    }
  };

  const trimmedTin = tinNumber.trim();

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight font-display">
            {tf('Business Info & Receipt Details', 'Amakuru y’Iduka & Inyemezabuguzi')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {tf(
              'Update your shop name, contact phone, email, address, and optional TIN shown on printed receipts, A4 invoices, and stock sheets.',
              'Vugurura izina ry’iduka, telefoni, imeri, aho rikorera, na TIN igaragara ku nyemezabuguzi n’impapuro za A4.'
            )}
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 self-start sm:self-auto">
          {tf('Shop Code:', 'Kode y’Iduka:')} {shop.code}
        </span>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span className="font-semibold">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-[#121620] border border-slate-800 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf('Business / Shop Name *', 'Izina ry’Ubucuruzi / Iduka *')}</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tf('e.g. Kigali Builders Quincaille', 'urugero: Kigali Builders Quincaille')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <UserIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf('Owner / Manager Name', 'Izina rya Nyir’iduka / Umuyobozi')}</span>
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={tf('e.g. Jean Claude Habimana', 'urugero: Jean Claude Habimana')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf('Business Phone Number *', 'Telefoni y’Iduka *')}</span>
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+250 788 123 456"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf('Business Email *', 'Imeri y’Iduka *')}</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="shop@example.rw"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>{tf('Shop Address / Location', 'Aho Iduka Riherereye')}</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={tf('e.g. Nyabugogo Commercial Center, Kigali', 'urugero: Nyabugogo, Kigali')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-amber-400" />
                <span>{tf('TIN Number (Optional)', 'Nomero ya TIN (Si ngombwa)')}</span>
              </label>
              {trimmedTin && (
                <button
                  type="button"
                  onClick={() => setTinNumber('')}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-300 transition"
                >
                  <Eraser className="w-3 h-3" />
                  <span>{tf('Clear TIN', 'Siba TIN')}</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={tinNumber}
              onChange={(e) => setTinNumber(e.target.value)}
              placeholder={tf('Leave blank if you do not want a TIN printed on receipts', 'Bireke birimo ubusa niba udashaka ko TIN igaragara ku nyemezabuguzi')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {tf(
                'Only enter a TIN if this shop prints one on receipts. When left blank, the TIN line is completely hidden — only your shop name, location, and phone appear.',
                'Shyiramo TIN gusa niba iri duka riyisohora ku nyemezabuguzi. Niba irimo ubusa, umurongo wa TIN urahishwa.'
              )}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>{tf('Receipt Bottom Thank-You Message (Optional)', 'Ubutumwa bwo Hasi ku Nyemezabuguzi (Si ngombwa)')}</span>
            </label>
            <input
              type="text"
              value={receiptFooterText}
              onChange={(e) => setReceiptFooterText(e.target.value)}
              placeholder={tf('e.g. Murakoze cyane! / Thank you for shopping with us.', 'urugero: Murakoze cyane kugura natwe!')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? tf('Saving Changes...', 'Birabikwa...') : tf('Save Business Details', 'Bika Amakuru y’Iduka')}</span>
            </button>
          </div>
        </form>

        {/* Live Receipt Header Preview */}
        <div className="p-5 rounded-2xl bg-[#121620] border border-slate-800 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>{tf('Live Receipt Header Preview', 'Uko Inyemezabuguzi Izagaragara')}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {tf('How the top and bottom of your 58mm, 80mm, and A4 receipts will look:', 'Uko hejuru na hasi ku nyemezabuguzi za 58mm, 80mm, na A4 hazagaragara:')}
            </p>

            <div className="bg-white text-black font-mono p-4 rounded-lg border border-slate-300 shadow-inner text-center space-y-1">
              <p className="font-black text-xs uppercase tracking-tight font-sans">
                {name.trim() || tf('YOUR SHOP NAME', 'IZINA RY’IDUKA')}
              </p>
              {location.trim() && (
                <p className="text-[10px] text-slate-800">{location.trim()}</p>
              )}
              <p className="text-[10px] text-slate-900">
                TEL: {phone.trim() || '+250 788 000 000'}
              </p>
              {trimmedTin && (
                <p className="text-[10px] font-bold text-black">
                  TIN: {trimmedTin}
                </p>
              )}
              <div className="border-t border-dashed border-black my-2 pt-2">
                <span className="inline-block border-2 border-black px-2.5 py-0.5 text-xs font-black tracking-tight text-black">
                  Client&apos;s Order
                </span>
              </div>
              <div className="py-3 text-[10px] text-slate-600 italic">
                [ Items &amp; totals appear here ]
              </div>
              <div className="border-t border-dashed border-black pt-2 text-[9px]">
                <p className="font-bold">
                  {receiptFooterText.trim() || 'Murakoze cyane! / Thank you!'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
            {trimmedTin ? (
              <span>
                TIN <strong className="text-amber-300 font-mono">{trimmedTin}</strong>{' '}
                {tf('will appear on receipts and PDFs for this shop.', 'izagaragara ku nyemezabuguzi na PDF z’iri duka.')}
              </span>
            ) : (
              <span>
                {tf(
                  `No TIN entered — receipts will show only your shop name${location.trim() ? ', location,' : ''} and phone number with no empty TIN space.`,
                  `Nta TIN yashyizwemo — inyemezabuguzi zizagaragaza gusa izina ry’iduka${location.trim() ? ', aho riherereye,' : ''} na telefoni.`
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
