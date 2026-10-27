'use client';

import { useState } from 'react';
import { X, Plus, Trash2, Home, MapPin, Check, Clock } from 'lucide-react';

interface HousePhoto {
  id: string;
  url: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface House {
  id: string;
  title: string;
  location: string;
  price: string;
  description: string;
  photos: HousePhoto[];
}

const initialHouses: House[] = [
  {
    id: 'house-1',
    title: 'Villa Vista Mar — Trancoso',
    location: 'Quadrado, Trancoso - BA',
    price: 'R$ 15.000 / diária',
    description: 'Luxuosa villa com vista panorâmica para o mar, piscina infinita e arquitetura integrada à natureza.',
    photos: [
      { id: 'p1', url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80', status: 'approved' },
      { id: 'p2', url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80', status: 'pending' }
    ]
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CatalogModal({ isOpen, onClose }: Props) {
  const [houses, setHouses] = useState<House[]>(initialHouses);
  const [selectedHouse, setSelectedHouse] = useState<House>(initialHouses[0]);
  const [isAddingHouse, setIsAddingHouse] = useState(false);

  // Form states para novo imóvel
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');

  if (!isOpen) return null;

  const handleAddHouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;

    const newHouse: House = {
      id: Date.now().toString(),
      title: newTitle,
      location: newLocation || 'Porto Seguro - BA',
      price: newPrice || 'Sob consulta',
      description: newDesc || 'Imóvel de alto padrão gerido pela Bahia Homes.',
      photos: newPhotoUrl ? [{ id: Date.now().toString(), url: newPhotoUrl, status: 'approved' }] : []
    };

    setHouses([...houses, newHouse]);
    setSelectedHouse(newHouse);
    setIsAddingHouse(false);
    setNewTitle('');
    setNewLocation('');
    setNewPrice('');
    setNewDesc('');
    setNewPhotoUrl('');
  };

  const handleAddPhotoToHouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhotoUrl.trim()) return;

    const updatedPhotos: HousePhoto[] = [
      ...selectedHouse.photos,
      { id: Date.now().toString(), url: newPhotoUrl, status: 'pending' }
    ];

    const updatedHouse = { ...selectedHouse, photos: updatedPhotos };
    setSelectedHouse(updatedHouse);
    setHouses(houses.map(h => h.id === updatedHouse.id ? updatedHouse : h));
    setNewPhotoUrl('');
  };

  const handleUpdatePhotoStatus = (photoId: string, status: 'approved' | 'rejected') => {
    const updatedPhotos = selectedHouse.photos.map(p => 
      p.id === photoId ? { ...p, status } : p
    );
    const updatedHouse = { ...selectedHouse, photos: updatedPhotos };
    setSelectedHouse(updatedHouse);
    setHouses(houses.map(h => h.id === updatedHouse.id ? updatedHouse : h));
  };

  const handleDeletePhoto = (photoId: string) => {
    const updatedPhotos = selectedHouse.photos.filter(p => p.id !== photoId);
    const updatedHouse = { ...selectedHouse, photos: updatedPhotos };
    setSelectedHouse(updatedHouse);
    setHouses(houses.map(h => h.id === updatedHouse.id ? updatedHouse : h));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Topbar do Modal */}
        <div className="px-6 py-4 bg-[#231b2d] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ccf600] text-black rounded-lg">
              <Home size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold">Catálogo de Imóveis & Mídia Bahia Homes</h2>
              <p className="text-xs text-gray-300">Gestão de portfólio e aprovação de conteúdos audiovisuais</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-300 hover:text-white rounded-lg transition">
            <X size={20} />
          </button>
        </div>

        {/* Corpo Dividido em Duas Colunas */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Coluna Esquerda: Lista de Imóveis */}
          <div className="w-80 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Imóveis ({houses.length})</span>
              <button 
                onClick={() => setIsAddingHouse(true)}
                className="bg-[#231b2d] text-[#ccf600] hover:bg-black p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-xs"
              >
                <Plus size={14} /> Novo Imóvel
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100 p-2 space-y-1">
              {houses.map(house => (
                <div
                  key={house.id}
                  onClick={() => { setSelectedHouse(house); setIsAddingHouse(false); }}
                  className={`p-3 rounded-xl cursor-pointer transition border ${
                    selectedHouse.id === house.id && !isAddingHouse
                      ? 'bg-white border-pink-500 shadow-sm' 
                      : 'bg-white/50 border-gray-200 hover:bg-white'
                  }`}
                >
                  <h4 className="font-bold text-xs text-gray-900 truncate">{house.title}</h4>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={10} className="text-gray-400" /> {house.location}
                  </p>
                  <span className="inline-block mt-2 text-[10px] bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded border border-amber-200">
                    {house.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna Direita: Detalhes do Imóvel ou Formulário de Novo Imóvel */}
          <div className="flex-1 bg-white flex flex-col overflow-y-auto p-6">
            
            {isAddingHouse ? (
              <form onSubmit={handleAddHouse} className="space-y-4 max-w-xl mx-auto w-full">
                <h3 className="text-base font-bold text-gray-900 border-b pb-2">Cadastrar Novo Imóvel no Catálogo</h3>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Título da Villa / Imóvel *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Villa Caraíva Luxury"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Localização</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Trancoso, BA"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Preço / Condição</label>
                    <input 
                      type="text" 
                      placeholder="Ex: R$ 10.000 / diária"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Descrição</label>
                  <textarea 
                    rows={3}
                    placeholder="Detalhes arquitetónicos, quartos, comodidades..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">URL da Foto Principal (Capa)</label>
                  <input 
                    type="url" 
                    placeholder="https://images.unsplash.com/..."
                    value={newPhotoUrl}
                    onChange={(e) => setNewPhotoUrl(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setIsAddingHouse(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-[#231b2d] text-[#ccf600] text-xs font-bold rounded-lg shadow-sm"
                  >
                    Salvar Imóvel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                
                {/* Header do Imóvel Selecionado */}
                <div className="flex justify-between items-start border-b pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{selectedHouse.title}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin size={12} className="text-pink-600" /> {selectedHouse.location} — <span className="font-semibold text-gray-700">{selectedHouse.price}</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                      {selectedHouse.description}
                    </p>
                  </div>
                </div>

                {/* Secção de Mídia e Aprovação de Fotos */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                      Banco de Imagens & Vídeos do Imóvel ({selectedHouse.photos.length})
                    </h4>
                    
                    {/* Adicionar Nova Mídia */}
                    <form onSubmit={handleAddPhotoToHouse} className="flex gap-2">
                      <input 
                        type="url" 
                        placeholder="Insira o URL da nova foto..."
                        value={newPhotoUrl}
                        onChange={(e) => setNewPhotoUrl(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-64"
                      />
                      <button type="submit" className="bg-pink-600 hover:bg-pink-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs">
                        Adicionar Mídia
                      </button>
                    </form>
                  </div>

                  {/* Grelha de Fotos */}
                  <div className="grid grid-cols-3 gap-4">
                    {selectedHouse.photos.map((photo) => (
                      <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-100 h-40 shadow-xs">
                        <img src={photo.url} alt="Imóvel" className="w-full h-full object-cover" />
                        
                        {/* Status Badge */}
                        <div className="absolute top-2 left-2">
                          {photo.status === 'approved' && (
                            <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                              <Check size={10} /> Aprovado
                            </span>
                          )}
                          {photo.status === 'pending' && (
                            <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                              <Clock size={10} /> Pendente
                            </span>
                          )}
                          {photo.status === 'rejected' && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                              Rejeitado
                            </span>
                          )}
                        </div>

                        {/* Botões de Ação na Foto */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleUpdatePhotoStatus(photo.id, 'approved')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg text-xs font-bold shadow"
                            title="Aprovar foto"
                          >
                            <Check size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeletePhoto(photo.id)}
                            className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg text-xs font-bold shadow"
                            title="Excluir foto"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                </div>

              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}