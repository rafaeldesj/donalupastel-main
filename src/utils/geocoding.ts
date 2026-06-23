export async function geocodeAddress(
  street: string,
  number: string,
  neighborhood: string,
  city = 'Rio de Janeiro'
): Promise<[number, number]> {
  const DONA_LU_COORDS: [number, number] = [-22.9112951, -43.5602961];
  const houseNumber = parseInt(number) || 0;

  // Função para gerar fallback determinístico
  const getFallback = () => {
    const combinedStr = `${street} ${number} ${neighborhood}`;
    const hash = combinedStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const latOffset = ((hash % 20) - 10) / 400; // ~ -0.025 a +0.025
    const lngOffset = ((hash % 17) - 8) / 400;
    return [DONA_LU_COORDS[0] + latOffset, DONA_LU_COORDS[1] + lngOffset] as [number, number];
  };

  // Helper para limpar e normalizar o nome da rua para o ViaCEP
  const getCoreStreetName = (name: string): string => {
    let cleaned = name
      .toLowerCase()
      // Remove prefixos comuns
      .replace(/^\s*(rua|avenida|av\.?|r\.?|travessa|tv\.?|praça|pr\.?|alameda|al\.?|rodovia|rod\.?)\s+/g, '')
      .trim();

    // Substitui abreviações comuns de títulos por extenso
    cleaned = cleaned
      .replace(/\bdr\.?\b/g, 'doutor')
      .replace(/\bdra\.?\b/g, 'doutora')
      .replace(/\bprof\.?\b/g, 'professor')
      .replace(/\bprofa\.?\b/g, 'professora')
      .replace(/\bsr\.?\b/g, 'senhor')
      .replace(/\bsra\.?\b/g, 'senhora');

    // Remove qualquer ponto ou caractere especial para evitar erros HTTP 400 do ViaCEP
    cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
    
    // Normaliza múltiplos espaços
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  };

  try {
    // 1. Tentar buscar CEP via ViaCEP
    const coreStreet = getCoreStreetName(street);
    const viaCepUrl = `https://viacep.com.br/ws/RJ/Rio%20de%20Janeiro/${encodeURIComponent(coreStreet)}/json/`;
    const viaCepRes = await fetch(viaCepUrl);
    
    if (viaCepRes.ok) {
      const contentType = viaCepRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const viaCepData = await viaCepRes.json();

        if (Array.isArray(viaCepData) && viaCepData.length > 0) {
          // Filtrar pelo bairro (Campo Grande por padrão ou o fornecido)
          const targetNeighborhood = (neighborhood || 'Campo Grande').toLowerCase();
          let entries = viaCepData.filter(
            (item: any) =>
              item.bairro.toLowerCase().includes(targetNeighborhood) ||
              targetNeighborhood.includes(item.bairro.toLowerCase())
          );

          // Se não achou com o bairro, usa a lista toda
          if (entries.length === 0) {
            entries = viaCepData;
          }

          // Encontrar a melhor correspondência de CEP baseado no número da casa
          let matchedCep = '';
          if (entries.length > 0) {
            const matchingEntry = entries.find((item: any) => {
              const comp = (item.complemento || '').toLowerCase();
              if (!comp) return false;

              const isOdd = houseNumber % 2 !== 0;
              const isEven = !isOdd;

              if (comp.includes('lado ímpar') && isEven) return false;
              if (comp.includes('lado par') && isOdd) return false;

              const numbers = comp.match(/\d+/g)?.map(Number) || [];

              if (comp.includes('até')) {
                const limit = numbers[0];
                if (limit && houseNumber > limit) return false;
              }
              if (comp.includes('de ') && comp.includes('ao fim')) {
                const limit = numbers[0];
                if (limit && houseNumber < limit) return false;
              }
              if (comp.includes('de ') && comp.includes('a ')) {
                const min = numbers[0];
                const max = numbers[1];
                if (min && houseNumber < min) return false;
                if (max && houseNumber > max) return false;
              }
              return true;
            });

            // Se achou correspondência exata, usa ela, senão pega a primeira sem complemento ou a primeira da lista
            matchedCep = matchingEntry ? matchingEntry.cep : entries[0].cep;
          }

          // 2. Se temos um CEP, buscar coordenadas via AwesomeAPI
          if (matchedCep) {
            const cleanCep = matchedCep.replace(/\D/g, '');
            const awesomeUrl = `https://cep.awesomeapi.com.br/json/${cleanCep}`;
            const awesomeRes = await fetch(awesomeUrl);
            
            if (awesomeRes.ok) {
              const awesomeContentType = awesomeRes.headers.get('content-type') || '';
              if (awesomeContentType.includes('application/json')) {
                const awesomeData = await awesomeRes.json();

                if (awesomeData && awesomeData.lat && awesomeData.lng) {
                  const lat = parseFloat(awesomeData.lat);
                  const lng = parseFloat(awesomeData.lng);
                  if (!isNaN(lat) && !isNaN(lng)) {
                    return [lat, lng];
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Erro no pipeline ViaCEP -> AwesomeAPI:", err);
  }

  // 3. Fallback: Buscar no Nominatim/Photon e usar nossa interpolação métrica aprimorada
  try {
    const queryStr = `${street}, ${neighborhood}, ${city}`;
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}&countrycodes=br&limit=10`;
    const nomRes = await fetch(nominatimUrl);
    let nomData = await nomRes.json();

    // Se Nominatim falhar, tenta o Photon
    if (!nomData || nomData.length === 0) {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(street)}&lat=${DONA_LU_COORDS[0]}&lon=${DONA_LU_COORDS[1]}&limit=10`;
      const photRes = await fetch(photonUrl);
      const photData = await photRes.json();
      if (photData && photData.features) {
        nomData = photData.features
          .filter((f: any) => f.properties?.countrycode === 'BR')
          .map((f: any) => ({
            lat: String(f.geometry.coordinates[1]),
            lon: String(f.geometry.coordinates[0]),
            display_name: f.properties.name
          }));
      }
    }

    if (nomData && nomData.length > 0) {
      const MAX_DIST = 0.15;
      const local = nomData.filter((d: any) => {
        const dLat = parseFloat(d.lat);
        const dLon = parseFloat(d.lon);
        return Math.abs(dLat - DONA_LU_COORDS[0]) < MAX_DIST && Math.abs(dLon - DONA_LU_COORDS[1]) < MAX_DIST;
      });

      if (local.length > 0) {
        const points = local.map((d: any) => ({
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon)
        }));

        const avgLat = points.reduce((acc: number, p: { lat: number; lng: number }) => acc + p.lat, 0) / points.length;
        const avgLng = points.reduce((acc: number, p: { lat: number; lng: number }) => acc + p.lng, 0) / points.length;
        return [avgLat, avgLng];
      }
    }
  } catch (err) {
    console.warn("Erro no geocodificador Nominatim:", err);
  }

  return getFallback();
}
