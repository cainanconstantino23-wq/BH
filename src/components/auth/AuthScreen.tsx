'use client';

import { useState } from 'react';
import { Mail, Lock, User, ArrowRight, BarChart2, AlertCircle } from 'lucide-react';

interface Props {
  onLogin: (userData: { name: string; email: string }) => void;
}

export function AuthScreen({ onLogin }: Props) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password || (!isLogin && !name)) {
      setErrorMessage('Por favor, preencha todos os campos.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }

    const storedUsers = JSON.parse(localStorage.getItem('bh_users') || '[]');

    if (isLogin) {
      // Procura exatamente pelo e-mail e pela senha correspondente
      const foundUser = storedUsers.find((u: any) => u.email === email && u.password === password);
      
      if (foundUser) {
        onLogin({ name: foundUser.name, email });
      } else {
        // Verifica se o e-mail existe mas a senha está errada
        const emailExists = storedUsers.some((u: any) => u.email === email);
        if (emailExists) {
          setErrorMessage('Palavra-passe incorreta para este e-mail.');
        } else {
          setErrorMessage('Conta não encontrada. Por favor, faça o cadastro primeiro.');
        }
      }
    } else {
      const userExists = storedUsers.some((u: any) => u.email === email);
      if (userExists) {
        setErrorMessage('Este e-mail já está cadastrado. Faça login.');
        return;
      }

      const newUser = { name, email, password };
      storedUsers.push(newUser);
      localStorage.setItem('bh_users', JSON.stringify(storedUsers));
      
      onLogin({ name, email });
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f4] flex flex-col justify-center items-center p-4">
      <div className="flex items-center gap-2 mb-8 text-[#231b2d]">
        <BarChart2 size={32} className="text-[#ccf600] bg-[#231b2d] p-1.5 rounded-lg" />
        <h1 className="text-2xl font-bold">Bahia Homes Analytics</h1>
      </div>

      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-gray-100 p-8 animate-in fade-in zoom-in duration-300">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {isLogin ? 'Bem-vindo de volta' : 'Criar nova conta'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {isLogin 
            ? 'Insira suas credenciais seguras para aceder ao painel.' 
            : 'Preencha os dados abaixo para registar o seu acesso.'}
        </p>

        {errorMessage && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nome Completo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cainan Daime"
                  className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#231b2d] focus:ring-1 focus:ring-[#231b2d] transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">E-mail</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail size={16} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#231b2d] focus:ring-1 focus:ring-[#231b2d] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Palavra-passe (mínimo 6 caracteres)</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock size={16} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#231b2d] focus:ring-1 focus:ring-[#231b2d] transition"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#ccf600] hover:bg-[#bce300] text-[#231b2d] font-bold text-sm py-2.5 rounded-lg transition flex items-center justify-center gap-2 mt-2 shadow-sm"
          >
            {isLogin ? 'Entrar no Painel' : 'Criar minha conta'}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          {isLogin ? 'Ainda não tem uma conta? ' : 'Já tem uma conta? '}
          <button
            onClick={() => { setIsLogin(!isLogin); setErrorMessage(''); }}
            className="text-blue-600 font-bold hover:underline"
          >
            {isLogin ? 'Cadastre-se' : 'Faça login'}
          </button>
        </div>
      </div>
    </div>
  );
}