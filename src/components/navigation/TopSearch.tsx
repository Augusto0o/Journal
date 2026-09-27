import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui';

/** Barra de búsqueda fija arriba de cada pestaña: abre «Buscar o preguntar». */
export function TopSearch() {
  const navigate = useNavigate();
  return (
    <div className="top-search-wrap">
      <button type="button" className="top-search" onClick={() => navigate('/buscar')} aria-label="Buscar o preguntar">
        <Icon name="search" size={18} />
        <span>Buscar o preguntar</span>
        <Icon name="sparkle" size={16} className="top-search-ai" />
      </button>
    </div>
  );
}
