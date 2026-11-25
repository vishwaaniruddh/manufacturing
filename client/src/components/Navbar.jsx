// client/src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  LogOut,
  Menu,
  X,
  User,
  Settings
} from 'lucide-react';
import { api } from '../services/api';

export default function Navbar({
  currentUser,
  onLogout,
  mobileMenuOpen,
  onToggleMobileMenu,
  onRefresh
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', password: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setShowProfileModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const openProfileSettings = () => {
    setMenuOpen(false);
    setProfileForm({
      name: currentUser?.name || '',
      phone: currentUser?.phone || '',
      password: ''
    });
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    setSavingProfile(true);
    try {
      const payload = { name: profileForm.name, phone: profileForm.phone };
      if (profileForm.password.trim()) {
        payload.password = profileForm.password.trim();
      }
      await api.updateUser(currentUser.id, payload);
      alert('Profile settings updated.');
      setShowProfileModal(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const initial = (currentUser?.name || 'U').trim().charAt(0).toUpperCase();

  return (
    <>
      <header className="bg-slate-900 text-slate-100 border-b border-slate-800 shrink-0 z-30 shadow-xs h-[3.25rem]">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 h-full flex items-center justify-between gap-2">
          {/* Brand / Logo + Mobile Menu Toggle */}
          <div className="flex items-center space-x-2 min-w-0">
            <button
              type="button"
              onClick={onToggleMobileMenu}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="bg-white rounded-md px-1.5 py-0.5 shadow-xs shrink-0 flex items-center">
              <img
                src="./sar-logo.png"
                alt="SAR Software Solutions Pvt. Ltd."
                className="h-7 w-auto object-contain"
              />
            </div>
            <div className="flex flex-col leading-tight truncate">
              <span className="font-bold text-xs sm:text-sm tracking-tight text-white truncate">
                SAR Manufacturing ERP
              </span>
              <span className="hidden sm:inline-block text-[10px] font-medium tracking-wide text-slate-400">
                Simple • Accurate • Reliable
              </span>
            </div>
          </div>

          {/* Circular User Avatar Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title={`${currentUser?.name || 'User'} (${currentUser?.role_name || 'User'})`}
              className="h-8 w-8 rounded-full bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center ring-2 ring-slate-700 hover:ring-sky-400 transition-all cursor-pointer select-none"
            >
              {initial}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-lg bg-white text-slate-800 shadow-xl border border-slate-200 py-1.5 z-50 text-xs"
              >
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="font-semibold text-slate-900 truncate">{currentUser?.name || 'User'}</p>
                  <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || ''}</p>
                  <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold">
                    {currentUser?.role_name || 'User'}
                  </span>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={openProfileSettings}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                >
                  <Settings className="h-3.5 w-3.5 text-slate-500" />
                  <span>Profile Settings</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (onLogout) onLogout();
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-rose-50 text-rose-600 font-medium cursor-pointer border-t border-slate-100 mt-0.5"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* PROFILE SETTINGS MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-sm w-full p-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-700" />
                <h2 className="text-sm font-semibold text-slate-900">Profile Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Email</label>
                <input
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone</label>
                <input
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">New Password (optional)</label>
                <input
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={profileForm.password}
                  onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="h-8 px-3 border border-slate-200 rounded-md text-slate-600 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="h-8 px-4 bg-slate-900 text-white rounded-md font-medium cursor-pointer disabled:opacity-60"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
