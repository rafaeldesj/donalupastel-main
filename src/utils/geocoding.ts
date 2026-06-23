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

  // Helper para limpar nome de rua para ViaCEP
  const getCoreStreetName = (name: string): string => {
    return name
      .replace(/^\s*(rua|avenida|av\.?|r\.?|travessa|tv\.?|praça|pr\.?|alameda|al\.?|rodovia|rod\.?)\s+/i, '')
      .trim();
  };

  try {
    // 1. Tentar buscar CEP via ViaCEP
    const coreStreet = getCoreStreetName(street);
    const viaCepUrl = `https://viacep.com.br/ws/RJ/Rio%20de%20Janeiro/${encodeURIComponent(coreStreet)}/json/`;
    const viaCepRes = await fetch(viaCepUrl);
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

        if (points.length === 1) {
          return [points[0].lat, points[0].lng];
        }

        const lats = points.map((p: { lat: number; lng: number }) => p.lat);
        const lngs = points.map((p: { lat: number; lng: number }) => p.lng);
        const latMin = Math.min(...lats);
        const latMax = Math.max(...lats);
        const lngMin = Math.min(...lngs);
        const lngMax = Math.max(...lngs);
        const latSpan = latMax - latMin;
        const lngSpan = lngMax - lngMin;

        if (lngSpan > latSpan) {
          points.sort((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => a.lng - b.lng);
        } else {
          points.sort((a: { lat: number; lng: number }, b: { lat: number; lng: number }) => a.lat - b.lat);
        }

        const RIO_CENTRO = { lat: -22.9068, lng: -43.1729 };
        const distStart = Math.pow(points[0].lat - RIO_CENTRO.lat, 2) + Math.pow(points[0].lng - RIO_CENTRO.lng, 2);
        const distEnd = Math.pow(points[points.length - 1].lat - RIO_CENTRO.lat, 2) + Math.pow(points[points.length - 1].lng - RIO_CENTRO.lng, 2);

        if (distEnd < distStart) {
          points.reverse();
        }

        const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
          const dy = (lat2 - lat1) * 111000;
          const dx = (lng2 - lng1) * 111000 * Math.cos((lat1 + lat2) * Math.PI / 360);
          return Math.sqrt(dx * dx + dy * dy);
        };

        const cumDist = [0];
        for (let i = 1; i < points.length; i++) {
          cumDist.push(cumDist[i - 1] + getDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng));
        }

        const totalLength = cumDist[cumDist.length - 1];

        if (houseNumber <= 0) {
          return [points[0].lat, points[0].lng];
        }
        if (houseNumber >= totalLength) {
          return [points[points.length - 1].lat, points[points.length - 1].lng];
        }

        for (let i = 1; i < points.length; i++) {
          if (houseNumber <= cumDist[i]) {
            const ratio = (houseNumber - cumDist[i - 1]) / (cumDist[i] - cumDist[i - 1] || 1);
            const lat = points[i - 1].lat + ratio * (points[i].lat - points[i - 1].lat);
            const lng = points[i - 1].lng + ratio * (points[i].lng - points[i - 1].lng);
            return [lat, lng];
          }
        }
      }
    }
  } catch (err) {
    console.warn("Erro no geocodificador Nominatim:", err);
  }

  return getFallback();
}
