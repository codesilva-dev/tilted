'use client';

import { useState } from 'react';

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (config: TableConfig) => void;
}

export interface TableConfig {
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
}

export default function CreateTableModal({ isOpen, onClose, onCreate }: CreateTableModalProps) {
  const [name, setName] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [minBuyIn, setMinBuyIn] = useState(1000);
  const [maxBuyIn, setMaxBuyIn] = useState(5000);
  const maxSeats = 9; // Always 9 seats

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Please enter a table name');
      return;
    }

    if (bigBlind <= smallBlind) {
      alert('Big blind must be larger than small blind');
      return;
    }

    if (maxBuyIn < minBuyIn) {
      alert('Max buy-in must be greater than or equal to min buy-in');
      return;
    }

    onCreate({
      name: name.trim(),
      smallBlind,
      bigBlind,
      minBuyIn,
      maxBuyIn,
      maxSeats
    });

    // Reset form
    setName('');
    setSmallBlind(10);
    setBigBlind(20);
    setMinBuyIn(1000);
    setMaxBuyIn(5000);
    setMaxSeats(9);

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-700 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-bold">Create New Table</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Table Name */}
          <div>
            <label className="block text-sm font-semibold mb-2">Table Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High Stakes, Friday Night, etc."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              maxLength={50}
              required
            />
          </div>

          {/* Blinds */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Small Blind</label>
              <input
                type="number"
                value={smallBlind}
                onChange={(e) => setSmallBlind(Number(e.target.value))}
                min={1}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Big Blind</label>
              <input
                type="number"
                value={bigBlind}
                onChange={(e) => setBigBlind(Number(e.target.value))}
                min={smallBlind + 1}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Buy-in Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Min Buy-in</label>
              <input
                type="number"
                value={minBuyIn}
                onChange={(e) => setMinBuyIn(Number(e.target.value))}
                min={bigBlind * 20}
                step={100}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Min: {bigBlind * 20} (20x BB)</p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Max Buy-in</label>
              <input
                type="number"
                value={maxBuyIn}
                onChange={(e) => setMaxBuyIn(Number(e.target.value))}
                min={minBuyIn}
                step={100}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Max Seats - Always 9 (removed dropdown) */}

          {/* Preset Buttons */}
          <div>
            <label className="block text-sm font-semibold mb-2">Quick Presets</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSmallBlind(5);
                  setBigBlind(10);
                  setMinBuyIn(500);
                  setMaxBuyIn(2000);
                }}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Micro ($5/$10)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmallBlind(10);
                  setBigBlind(20);
                  setMinBuyIn(1000);
                  setMaxBuyIn(5000);
                }}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Low ($10/$20)
              </button>
              <button
                type="button"
                onClick={() => {
                  setSmallBlind(50);
                  setBigBlind(100);
                  setMinBuyIn(5000);
                  setMaxBuyIn(20000);
                }}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                High ($50/$100)
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-700 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Table Summary</h3>
            <div className="text-sm text-gray-300 space-y-1">
              <div>Blinds: ${smallBlind}/${bigBlind}</div>
              <div>Buy-in Range: ${minBuyIn.toLocaleString()} - ${maxBuyIn.toLocaleString()}</div>
              <div>Max Players: {maxSeats}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Create Table
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
