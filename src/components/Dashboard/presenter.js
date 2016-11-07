import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import { Button, Dimmer, Container, Header, Segment, Label, Loader, Progress, List } from 'semantic-ui-react';
import {services} from '../../actions/services';
import * as _ from 'lodash';
import {mergeState, mgrUpdateGen} from '../../util/localStateOperations';

class Dashboard extends Component {

  constructor(props) {
    super(props);

    const init = {
      ephemeral: {
        fetching: true,
        interval: undefined
      },
      services: [], // enriched
    };

    this.state = init;
  }

  componentWillMount() {
    document.title += ' - Dashboard';

    const {onAttributesGet, onAgreementsGet, onDeviceGet, onServicesGet, router} = this.props;

    // to get something as soon as possible
    onAttributesGet()
      .then((data) => {
        if (!!data && 'attributes' in data) {
          this.setState(mergeState(this.state, {services: _.filter(data.attributes, {id: 'compute'}), ephemeral: { fetching: false}}));

          const enrichFn = this.enrich([onServicesGet, onAgreementsGet], router);
          // get it started
          enrichFn();

          // schedule
          this.setState(mergeState(this.state, {ephemeral: {interval: setInterval(enrichFn, 2000)}}));
        }
      });
    onDeviceGet();
  }

  componentWillUnmount() {
    clearInterval(this.state.ephemeral.interval);
  }

  enrich(fns, router) {

    let hydrate = (computeAttrs, serviceData, agreementData) => {
      return _.map(computeAttrs, (compute) => {

        // TODO: expand to accommodate more sensor urls and more applicable enrichments
        const policy = _.filter(serviceData, (d) => { return compute.sensor_urls[0] === d.policy.apiSpec[0].specRef;});
        const active = _.filter(agreementData.agreements.active, (a) => { return compute.sensor_urls[0] === a.sensor_url});
        const archived = _.filter(agreementData.agreements.archived, (a) => { return compute.sensor_urls[0] === a.sensor_url});

        return {...compute, ...policy[0], agreements: {active, archived}};
      });
    }

    return () => {
      // TODO: do this better; componentWillUnmount isn't doing it but that's the right way to handle this
      if (!router.isActive({pathname: '/dashboard'})) {
        return;
      }

      Promise.all(_.map(fns, (fn) => {return fn();})).then((responses) => {

        this.setState(mergeState(this.state, {
          services: hydrate(this.state.services, responses[0], responses[1])
        }));
      });
    };
  }

  render() {
    const { attributes, device, router } = this.props;

    let view;
    if (_.isEmpty(this.state.services)) {
      view = (
        <Segment padded>
          <p>Your device is not configured to execute any services.</p>
          <Button fluid primary color="blue" onClick={() => {router.push('/setup');}}>Begin Setup</Button>
        </Segment>
      );
    } else {
      view = (
        _.map(_.sortBy(this.state.services, (serv) => { return ('agreements' in serv && serv.agreements.active.length === 0);}), (it) => {
          let color, percent, tag;
          if (!'policy' in it) {
            color = 'orange';
            percent = 10;
            tag = 'Registering';
          } else if ('agreements' in it && it.agreements.active.length > 0) {
            color = 'green';
            percent = 100;
            tag = 'In Agreement';
          } else {
            color = 'blue';
            percent = 60;
            tag = 'Registered';
          }

          return (
            <Segment key={it.sensor_urls.join('/')}>

              <Header size="medium">{it.label}</Header>
              <Progress percent={percent} attached='top' color={color} />
              <Label as='a' color={color} attached="top right">{tag}</Label>

              <List divided relaxed>
                <List.Item>
                  <List.Content>
                    <List.Header>Compute Resources</List.Header>
                    <List.Description><strong>CPUs</strong>: {it.mappings.cpus}, <strong>RAM</strong>: {it.mappings.ram} MB</List.Description>
                  </List.Content>
                </List.Item>
                {'agreements' in it ?
                <List.Item>
                  <List.Content>
                    <List.Header>Agreements</List.Header>
                    {it.agreements.active.length > 0 ?
                        <div>
                          <List.Description><strong>Counterparty</strong>: {it.agreements.active[0].consumer_id}</List.Description>
                          <List.Description><strong>Id</strong>: <span style={{fontFamily: 'mono'}}>{it.agreements.active[0].current_agreement_id}</span></List.Description>
                        </div>
                        :
                        <span></span>
                    }
                    <br />
                    <List.Description><strong>Archived</strong>: {it.agreements.archived.length}</List.Description>
                    {it.agreements.archived.length > 0 ?
                        <div>
                          <List.Description><strong>Terminated Time</strong>: {it.agreements.archived[0].agreement_terminated_time}, <strong>Terminated Reason</strong>: {it.agreements.archived[0].terminated_reason}, <strong>Terminated Description</strong>: {it.agreements.archived[0].terminated_description}</List.Description>
                        </div>
                        :
                        <span></span>
                    }
                  </List.Content>
                </List.Item>
                    :
                    <span></span>
                }
              </List>
            </Segment>
          );
        })
      )
    }

    return (
      <div>
        <Header size="large"><em>{'name' in device ? `${device.name} ` : '' }</em></Header>
        {!this.state.ephemeral.fetching ? view : ''}
      </div>
    );
  }
}

export default Dashboard;