import "@arcgis/map-components/dist/components/arcgis-map";
import "@arcgis/map-components/dist/components/arcgis-search";
import "@arcgis/map-components/dist/components/arcgis-zoom";

import "@arcgis/core/assets/esri/themes/dark/main.css";

import { ArcgisMap, ArcgisZoom } from "@arcgis/map-components-react";
import Query from '@arcgis/core/rest/support/query';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import PictureMarkerSymbol from "@arcgis/core/symbols/PictureMarkerSymbol.js";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Popup from "@arcgis/core/widgets/Popup";
import Extent from "@arcgis/core/geometry/Extent";
import PopupTemplate from "@arcgis/core/PopupTemplate";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader } from "@googlemaps/js-api-loader";
import { Button, Container, Heading, Input, Spinner, Typewriter } from "./ui";
import { Ctx, env, simp } from "./util";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

type ActivePopup = {
	attributes: Record<string, string|number>,
	node: HTMLDivElement
};

type Dest = {name: string, address: string};
const lawsonPos = [40.427557134937665, -86.91697639182239];

const campusBounds = [
	[40.400088635153054, -86.95635748133583],
	[40.445444031839955, -86.88637668331914]
] as const;

function CampusMap({getDirections}:{getDirections: (to: Dest)=>void}) {
	const ref = useRef<HTMLArcgisMapElement>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const [map, setMap] = useState<any|null>(null);
	const [features, setFeatures] = useState<FeatureSet>();
	const [active, setActive] = useState<ActivePopup|null>(null);
	const [activeImgLoad, setActiveImgLoad] = useState<boolean>(false);

	useEffect(()=>setActiveImgLoad(true), [active]);
	useEffect(()=>{
		if (map==null) return;
		console.log("loading map");

		const popup = new Popup({
			dockEnabled: true,
			dockOptions: {
				buttonEnabled: false,
				breakpoint: false,
				position: "top-left",
			},
		});

		ref.current!.center=[lawsonPos[1], lawsonPos[0]];

		const cur = new FeatureLayer({
			url: "https://services1.arcgis.com/mLNdQKiKsj5Z5YMN/arcgis/rest/services/BuildingShapesZip4/FeatureServer/0",
			popupTemplate: new PopupTemplate({
				title: "{BUILDING_N} ({BLDG_ABBR})",
				content: (props: {graphic: {geometry: unknown, attributes: Record<string, string|number>}}) => {
					const div = document.createElement("div");
					ref.current!.goTo({target: props.graphic.geometry, zoom: 17});
					setActive({attributes: props.graphic.attributes, node: div});
					return div;
				}
			}),
			outFields: ["BUILDING_N","BLDG_ABBR","ADDRESS","Zip","Plus4"],
			popupEnabled: true
		});

		const pictureMarkerSymbol = new PictureMarkerSymbol({
			angle: 0,
			height: 50,
			url: "/here.png",
			width: 50,
			xoffset: 0,
			yoffset: 20
		});

		const pointGraphic = new Graphic({
			geometry: new Point({latitude: lawsonPos[0], longitude: lawsonPos[1]}),
			symbol: pictureMarkerSymbol
		});

		(async () => {
      const query = new Query({
        returnGeometry: true,
        outFields: ['*'],
        where: '1=1',
      });

			setFeatures(await cur.queryFeatures(query));
		})();

		map.add(cur);

		const graphics = new GraphicsLayer();
		graphics.add(pointGraphic);
		map.add(graphics);

		const root = ref.current!;
		root.popup = popup;
		const handle = popup.watch("close", ()=>{
			setActive(null);
		});

		return ()=>{
			setActive(null);
			handle.remove();
			map.removeAll();
			graphics.removeAll();

			root.popup=undefined;
			cur.destroy();
			popup.destroy();
			pointGraphic.destroy();
			pictureMarkerSymbol.destroy();
			graphics.destroy();
		};
	}, [map]);

	const [search, setSearch] = useState("");
	const found = useMemo(()=>{
		if (!features || search.length==0) return [];
		const ssearch = simp(search);
		return features.features.filter(g=>
			["BUILDING_N", "BLDG_ABBR"].some(f=>simp(g.attributes[f]).includes(ssearch))
		);
	}, [search, features]);

	return <div className="h-full w-full flex-1 relative" >
		{features && <div className="top-3 right-3 absolute z-10 bg-zinc-800/80 rounded-lg p-2" >
			<p className="text-gray-200" >Search...</p>
			<Input value={search} onChange={(ev)=>setSearch(ev.target.value)} ></Input>
			<div className="flex flex-col gap-1 max-w-80 mt-2" >
				{found.map(f=><button className="bg-zinc-800 p-2" onClick={()=>{
					ref.current!.popup.open({features: [f]});
					setSearch("");
				}} >
					{f.attributes["BUILDING_N"]}
				</button>)}
			</div>
		</div>}
		<ArcgisMap className="absolute left-0 right-0 top-0 bottom-0 outline-none"
			ref={ref}
			onArcgisViewReadyChange={(ev)=>setMap(ev.target.map)}
			basemap="streets-night-vector"
			onClick={(ev)=>{
				if (ev.target instanceof HTMLAnchorElement)
					ev.preventDefault();
			}}
			theme="dark"
			constraints={{
				minZoom: 15, maxZoom: 18,
				geometry: new Extent({
					xmin: campusBounds[0][1], xmax: campusBounds[1][1],
					ymin: campusBounds[0][0], ymax: campusBounds[1][0]
				})
			}} >
			<ArcgisZoom position="top-left"></ArcgisZoom>
			{active && createPortal(<div className="flex flex-col gap-1 items-start" >
				{activeImgLoad && <img src={`https://www.purdue.edu/campus-map/campus-buildings/${active.attributes["BLDG_ABBR"]}.jpg`} className="mb-2" onError={()=>setActiveImgLoad(false)} />}
				<p>{active.attributes["ADDRESS"]}</p>
				West Lafayette, IN {active.attributes["Zip"]} - {active.attributes["Plus4"]}

				<Button className="mt-2" onClick={()=>{
					getDirections({
						name: active.attributes["BUILDING_N"] as string,
						address: `${active.attributes["ADDRESS"] as string}, West Lafayette, IN ${active.attributes["Zip"]}, USA`
					});
				}} >Get directions</Button>
			</div>, active.node)}
		</ArcgisMap>
	</div>;
}

const loader = new Loader({
	apiKey: env.VITE_MAPS_API_KEY,
  version: "weekly"
});

function Directions({to, back}: {to: Dest, back: ()=>void}) {
	const ctx = useContext(Ctx);
	const ref = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<google.maps.Map>();

	useEffect(()=>{
		let map: google.maps.Map|null=null;
		ctx.handle(async ()=>{
			const core = await loader.importLibrary("core");
			const maps = await loader.importLibrary("maps");
			const marker = await loader.importLibrary("marker");
			const routes = await loader.importLibrary("routes");
			
			const route = await new routes.DirectionsService().route({
				origin: {placeId: "ChIJOeawkrPiEogRzu4AVA40mio"},
				destination: to.address,
				travelMode: routes.TravelMode.WALKING,
			});

			setMap(map=new maps.Map(ref.current!, {
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
				restriction: {
					latLngBounds: new core.LatLngBounds(
						{lat: campusBounds[0][0], lng: campusBounds[0][1]},
						{lat: campusBounds[1][0], lng: campusBounds[1][1]}
					)
				}
      }));

			const peteIcon = {
        url: "/pete-small.png",
				scaledSize: new core.Size(50,50),
        labelOrigin: new core.Point(25, 60),
      };

			const add = (label: string, position: google.maps.LatLng, html?: string) => {
				const m = new marker.Marker({
					icon: peteIcon,
					label, position, map, clickable: html!=undefined
				});
				
				if (html!=undefined) m.addListener("click", ()=>{
					const b = document.createElement("b");
					b.innerText=label;

					new google.maps.InfoWindow({
						headerContent: b,
						content: `<p>${html}</p>`
					}).open(map, m);
				});
			};

			const legs = route.routes[0].legs;
			add(to.name, legs[legs.length-1].end_location, to.address);
			add("Lawson", legs[0].start_location);

			for (const leg of legs) {
				for (const step of leg.steps) {
					const maneuverName: Record<string,string> = {
						"turn-left": "Turn left",
						"turn-right": "Turn right",
						"turn-slight-left": "Turn slightly left",
						"turn-slight-right": "Turn slightly right",
						"turn-sharp-left": "Turn sharply left",
						"turn-sharp-right": "Turn sharply right",
						"merge": "Merge",
						"roundabout-left": "Enter roundabout",
						"roundabout-right": "Enter roundabout",
						"roundabout": "Enter roundabout",
						"straight": "Go straight",
						"uturn-left": "Make a U-turn",
						"uturn-right": "Make a U-turn",
						"fork-left": "Fork left",
						"fork-right": "Fork right"
					};

					if (step.maneuver in maneuverName)
						add(maneuverName[step.maneuver], step.start_location, step.instructions);
				}
			}

			new google.maps.DirectionsRenderer({
				directions: route, map,
				suppressMarkers: true,
			});

			map.fitBounds(route.routes[0].bounds);
		});
	}, [ctx, to]);
	
	return <Container className="max-w-screen-xl" >
		<div className="flex flex-col gap-1 items-start" >
			<Heading>
				<Typewriter text={`Directions to ${to.name}`} ></Typewriter>
			</Heading>
			<p className="text-gray-200" >on {to.address}</p>
			<Button onClick={back} >Go back to the map</Button>
		</div>

		{map==undefined ? <Spinner/> : <></>}
		<div ref={ref} className="h-[70dvh] w-full -mx-5 text-black rounded-xl" onClick={(ev)=>{
			if (ev.target instanceof HTMLElement && ev.target.closest("a")!=null) ev.preventDefault();
		}} ></div>
	</Container>;
}

export default function MapApp() {
	const [to, setTo] = useState<Dest>();
	return to ? <Directions to={to} back={()=>setTo(undefined)} ></Directions>
		: <CampusMap getDirections={setTo} ></CampusMap>;
}