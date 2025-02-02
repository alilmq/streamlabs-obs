import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';
import { UserService } from '../../services/user';
import { Inject, Service } from 'services';
import { GuestApiService } from 'services/guest-api';
import { NavigationService } from 'services/navigation';
import { SceneCollectionsService } from 'services/scene-collections';
import { IDownloadProgress, OverlaysPersistenceService } from 'services/scene-collections/overlays';
import { ScenesService } from 'services/scenes';
import { WidgetsService } from 'services/widgets';
import { NotificationsService, ENotificationType } from 'services/notifications';
import { JsonrpcService } from 'services/api/jsonrpc/jsonrpc';
import { MagicLinkService } from 'services/magic-link';
import urlLib from 'url';
import electron from 'electron';
import { $t, I18nService } from 'services/i18n';
import BrowserView from 'components/shared/BrowserView';

@Component({ components: { BrowserView } })
export default class BrowseOverlays extends Vue {
  @Inject() userService: UserService;
  @Inject() guestApiService: GuestApiService;
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() navigationService: NavigationService;
  @Inject() overlaysPersistenceService: OverlaysPersistenceService;
  @Inject() widgetsService: WidgetsService;
  @Inject() scenesService: ScenesService;
  @Inject() private magicLinkService: MagicLinkService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private jsonrpcService: JsonrpcService;

  @Prop() params: {
    type?: 'overlay' | 'widget-theme';
    id?: string;
  };

  onBrowserViewReady(view: Electron.BrowserView) {
    view.webContents.on('did-finish-load', () => {
      this.guestApiService.exposeApi(view.webContents.id, {
        installOverlay: this.installOverlay,
        installWidgets: this.installWidgets,
      });
    });

    electron.ipcRenderer.send('webContents-preventPopup', view.webContents.id);

    view.webContents.on('new-window', (e, url) => {
      const protocol = urlLib.parse(url).protocol;

      if (protocol === 'http:' || protocol === 'https:') {
        electron.remote.shell.openExternal(url);
      }
    });
  }

  async installOverlay(
    url: string,
    name: string,
    progressCallback?: (progress: IDownloadProgress) => void,
  ) {
    const host = new urlLib.URL(url).hostname;
    const trustedHosts = ['cdn.streamlabs.com'];

    if (!trustedHosts.includes(host)) {
      console.error(`Ignoring overlay install from untrusted host: ${host}`);
      return;
    }

    await this.sceneCollectionsService.installOverlay(url, name, progressCallback);
    this.navigationService.navigate('Studio');
  }

  async installWidgets(urls: string[], progressCallback?: (progress: IDownloadProgress) => void) {
    for (const url of urls) {
      const host = new urlLib.URL(url).hostname;
      const trustedHosts = ['cdn.streamlabs.com'];

      if (!trustedHosts.includes(host)) {
        console.error(`Ignoring widget install from untrusted host: ${host}`);
        return;
      }

      const path = await this.overlaysPersistenceService.downloadOverlay(url, progressCallback);
      await this.widgetsService.loadWidgetFile(path, this.scenesService.activeSceneId);
    }

    this.navigationService.navigate('Studio');

    this.notificationsService.push({
      type: ENotificationType.SUCCESS,
      lifeTime: 8000,
      showTime: false,
      message: $t('Widget Theme installed & activated. Click here to manage your Widget Profiles.'),
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.magicLinkService),
        'openWidgetThemesMagicLink',
      ),
    });
  }

  get overlaysUrl() {
    return this.userService.overlaysUrl(this.params.type, this.params.id);
  }
}
